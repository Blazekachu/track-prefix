import Database from "better-sqlite3";
import { SERIES } from "@/core/series";
import { WALLET_LABELS } from "@/core/wallet-labels";
import { loadConfig } from "@/core/job-config";
import { getActiveDbPath } from "@/core/job-library";
import { satToBlock } from "@/core/sat-math";

export function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id INTEGER PRIMARY KEY,
      name_length INTEGER NOT NULL,
      sat_start TEXT NOT NULL,
      sat_end TEXT NOT NULL,
      sat_count INTEGER NOT NULL,
      target_block INTEGER NOT NULL,
      estimated_year TEXT NOT NULL,
      mined INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS utxos (
      outpoint TEXT NOT NULL,
      address TEXT NOT NULL,
      sat_range_start TEXT NOT NULL,
      sat_range_end TEXT NOT NULL,
      sat_count INTEGER NOT NULL,
      spent INTEGER NOT NULL DEFAULT 0,
      input_offset TEXT NOT NULL DEFAULT '0',
      last_moved TEXT,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_checked TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (outpoint, sat_range_start)
    );

    CREATE TABLE IF NOT EXISTS inscriptions (
      sat_number TEXT PRIMARY KEY,
      inscription_id TEXT NOT NULL,
      content_type TEXT,
      utxo_outpoint TEXT
    );

    CREATE TABLE IF NOT EXISTS trace_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_traced_txid TEXT,
      last_traced_depth INTEGER NOT NULL DEFAULT 0,
      total_utxos_found INTEGER NOT NULL DEFAULT 0,
      fee_sats_retraced TEXT NOT NULL DEFAULT '0',
      last_run TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'idle'
    );

    CREATE TABLE IF NOT EXISTS trace_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      outpoint TEXT NOT NULL,
      sat_range_start TEXT NOT NULL,
      sat_range_end TEXT NOT NULL,
      depth INTEGER NOT NULL DEFAULT 0,
      input_offset TEXT NOT NULL DEFAULT '0',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trace_queue_outpoint
      ON trace_queue(outpoint, sat_range_start, sat_range_end);

    CREATE TABLE IF NOT EXISTS wallet_labels (
      address TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'unknown'
    );

    -- Migration: add last_moved if missing
    CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY);
  `);

  // Add last_moved column if it doesn't exist
  const cols = db.pragma('table_info(utxos)') as Array<{ name: string }>;
  if (!cols.find(c => c.name === 'last_moved')) {
    db.exec(`ALTER TABLE utxos ADD COLUMN last_moved TEXT`);
  }

  // Migration: add input_offset for correct FIFO tracking
  const hasOffsetMigration = db.prepare(
    "SELECT name FROM _migrations WHERE name = 'add_input_offset'"
  ).get();
  if (!hasOffsetMigration) {
    const queueCols = db.pragma('table_info(trace_queue)') as Array<{ name: string }>;
    if (!queueCols.find(c => c.name === 'input_offset')) {
      db.exec(`ALTER TABLE trace_queue ADD COLUMN input_offset TEXT NOT NULL DEFAULT '0'`);
    }
    const utxoCols = db.pragma('table_info(utxos)') as Array<{ name: string }>;
    if (!utxoCols.find(c => c.name === 'input_offset')) {
      db.exec(`ALTER TABLE utxos ADD COLUMN input_offset TEXT NOT NULL DEFAULT '0'`);
    }
    // Clear existing data — previous FIFO mapping was incorrect
    db.exec(`
      DELETE FROM utxos;
      DELETE FROM trace_queue;
      DELETE FROM trace_state;
      DELETE FROM inscriptions;
      INSERT INTO _migrations (name) VALUES ('add_input_offset');
    `);
  }

  // Migration: composite PK for utxos (outpoint + sat_range_start)
  const hasCompositePk = db.prepare(
    "SELECT name FROM _migrations WHERE name = 'utxo_composite_pk'"
  ).get();
  if (!hasCompositePk) {
    db.exec(`
      DROP TABLE IF EXISTS utxos;
      CREATE TABLE utxos (
        outpoint TEXT NOT NULL,
        address TEXT NOT NULL,
        sat_range_start TEXT NOT NULL,
        sat_range_end TEXT NOT NULL,
        sat_count INTEGER NOT NULL,
        spent INTEGER NOT NULL DEFAULT 0,
        input_offset TEXT NOT NULL DEFAULT '0',
        last_moved TEXT,
        first_seen TEXT NOT NULL DEFAULT (datetime('now')),
        last_checked TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (outpoint, sat_range_start)
      );
      DELETE FROM trace_queue;
      DELETE FROM trace_state;
      DELETE FROM inscriptions;
      INSERT INTO _migrations (name) VALUES ('utxo_composite_pk');
    `);
  }

  // Migration: add fee_sats_retraced to trace_state
  const hasFeeMigration = db.prepare(
    "SELECT name FROM _migrations WHERE name = 'add_fee_sats_retraced'"
  ).get();
  if (!hasFeeMigration) {
    const stateCols = db.pragma('table_info(trace_state)') as Array<{ name: string }>;
    if (!stateCols.find(c => c.name === 'fee_sats_retraced')) {
      db.exec(`ALTER TABLE trace_state ADD COLUMN fee_sats_retraced TEXT NOT NULL DEFAULT '0'`);
    }
    db.exec(`INSERT INTO _migrations (name) VALUES ('add_fee_sats_retraced')`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_utxos_sat_range
      ON utxos(sat_range_start, sat_range_end);
    CREATE INDEX IF NOT EXISTS idx_utxos_address
      ON utxos(address);
    CREATE INDEX IF NOT EXISTS idx_utxos_spent
      ON utxos(spent);
    CREATE INDEX IF NOT EXISTS idx_inscriptions_outpoint
      ON inscriptions(utxo_outpoint);
  `);
}

export function seedSeries(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO series (id, name_length, sat_start, sat_end, sat_count, target_block, estimated_year, mined)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const cfg =
    process.env.VITEST || process.env.NODE_ENV === "test"
      ? null
      : loadConfig();
  if (cfg?.job) {
    const job = cfg.job;
    const satStart = BigInt(job.satStart);
    const targetBlock = Number(satToBlock(satStart));
    const prior = db
      .prepare("SELECT sat_start, sat_end FROM series WHERE id = ?")
      .get(job.seriesId) as { sat_start: string; sat_end: string } | undefined;
    const jobChanged =
      !prior ||
      prior.sat_start !== job.satStart ||
      prior.sat_end !== job.satEnd;

    db.exec("DELETE FROM series");
    insert.run(
      job.seriesId,
      job.nameLength,
      job.satStart,
      job.satEnd,
      Number(job.satCount),
      targetBlock,
      "tracked",
      1
    );

    if (jobChanged) {
      db.exec(`
        DELETE FROM utxos;
        DELETE FROM trace_queue;
        DELETE FROM trace_state;
        DELETE FROM inscriptions;
      `);
    }
    return;
  }

  const tx = db.transaction(() => {
    for (const s of SERIES) {
      insert.run(
        s.id,
        s.nameLength,
        s.satStart.toString(),
        s.satEnd.toString(),
        Number(s.satCount),
        Number(s.targetBlock),
        s.estimatedYear,
        s.mined ? 1 : 0
      );
    }
  });

  tx();
}

/**
 * Sync the wallet_labels table to mirror the WALLET_LABELS code map exactly.
 * Runs on every getDb(), so labels survive trace:reset and stay authoritative.
 */
export function seedWalletLabels(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR REPLACE INTO wallet_labels (address, label, kind) VALUES (?, ?, ?)"
  );
  const tx = db.transaction(() => {
    db.exec("DELETE FROM wallet_labels");
    for (const [address, wl] of Object.entries(WALLET_LABELS)) {
      insert.run(address, wl.label, wl.kind);
    }
  });
  tx();
}

export function getDb(dbPath?: string): Database.Database {
  const path =
    dbPath ||
    (process.env.DATABASE_PATH
      ? process.env.DATABASE_PATH
      : getActiveDbPath());
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedSeries(db);
  seedWalletLabels(db);
  return db;
}
