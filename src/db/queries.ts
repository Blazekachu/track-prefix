import type Database from "better-sqlite3";
import { SERIES } from "@/core/series";

export interface SeriesRow {
  id: number;
  name_length: number;
  sat_start: string;
  sat_end: string;
  sat_count: number;
  target_block: number;
  estimated_year: string;
  mined: number;
}

export function getSeries(db: Database.Database): SeriesRow[] {
  return db.prepare("SELECT * FROM series ORDER BY id").all() as SeriesRow[];
}

export function getSeriesById(db: Database.Database, id: number): SeriesRow | null {
  return (db.prepare("SELECT * FROM series WHERE id = ?").get(id) as SeriesRow) || null;
}

export interface UtxoRow {
  outpoint: string;
  address: string;
  sat_range_start: string;
  sat_range_end: string;
  sat_count: number;
  spent: number;
  input_offset: string;
  last_moved: string | null;
  first_seen: string;
  last_checked: string;
}

export interface UtxoInput {
  outpoint: string;
  address: string;
  sat_range_start: string;
  sat_range_end: string;
  sat_count: number;
  spent: boolean;
  input_offset: string;
  last_moved?: string | null;
}

export function upsertUtxo(db: Database.Database, utxo: UtxoInput): void {
  db.prepare(`
    INSERT INTO utxos (outpoint, address, sat_range_start, sat_range_end, sat_count, spent, input_offset, last_moved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(outpoint, sat_range_start) DO UPDATE SET
      address = excluded.address,
      sat_range_end = excluded.sat_range_end,
      sat_count = excluded.sat_count,
      spent = excluded.spent,
      input_offset = excluded.input_offset,
      last_moved = excluded.last_moved,
      last_checked = datetime('now')
  `).run(
    utxo.outpoint,
    utxo.address,
    utxo.sat_range_start,
    utxo.sat_range_end,
    utxo.sat_count,
    utxo.spent ? 1 : 0,
    utxo.input_offset,
    utxo.last_moved ?? null
  );
}

export function getUtxosBySeries(db: Database.Database, seriesId: number): UtxoRow[] {
  const series = SERIES[seriesId - 1];
  if (!series) return [];
  const start = series.satStart.toString();
  const end = series.satEnd.toString();
  return db.prepare(`
    SELECT * FROM utxos
    WHERE sat_range_start <= ? AND sat_range_end >= ?
    ORDER BY sat_count DESC
  `).all(end, start) as UtxoRow[];
}

export function markUtxoSpent(db: Database.Database, outpoint: string, satRangeStart?: string): void {
  if (satRangeStart) {
    db.prepare("UPDATE utxos SET spent = 1, last_checked = datetime('now') WHERE outpoint = ? AND sat_range_start = ?").run(outpoint, satRangeStart);
  } else {
    db.prepare("UPDATE utxos SET spent = 1, last_checked = datetime('now') WHERE outpoint = ?").run(outpoint);
  }
}

/**
 * Backfill last_moved for a UTXO that was recorded from a then-unconfirmed tx
 * (no block time available at record time). Called once the tx has confirmed.
 */
export function updateUtxoLastMoved(
  db: Database.Database,
  outpoint: string,
  satRangeStart: string,
  lastMoved: string
): void {
  db.prepare(
    "UPDATE utxos SET last_moved = ?, last_checked = datetime('now') WHERE outpoint = ? AND sat_range_start = ?"
  ).run(lastMoved, outpoint, satRangeStart);
}

export interface UtxoStats {
  utxo_count: number;
  wallet_count: number;
  total_sats: number;
  inscribed_count: number;
}

export function getUtxoStats(db: Database.Database, seriesId: number): UtxoStats {
  const series = SERIES[seriesId - 1];
  if (!series) return { utxo_count: 0, wallet_count: 0, total_sats: 0, inscribed_count: 0 };
  const start = series.satStart.toString();
  const end = series.satEnd.toString();

  const row = db.prepare(`
    SELECT
      COUNT(*) as utxo_count,
      COUNT(DISTINCT address) as wallet_count,
      COALESCE(SUM(sat_count), 0) as total_sats
    FROM utxos
    WHERE sat_range_start <= ? AND sat_range_end >= ? AND spent = 0
  `).get(end, start) as { utxo_count: number; wallet_count: number; total_sats: number };

  const inscribed = db.prepare(`
    SELECT COUNT(*) as cnt FROM inscriptions i
    JOIN utxos u ON i.utxo_outpoint = u.outpoint
    WHERE u.sat_range_start <= ? AND u.sat_range_end >= ?
  `).get(end, start) as { cnt: number };

  return { ...row, inscribed_count: inscribed.cnt };
}

export interface InscriptionRow {
  sat_number: string;
  inscription_id: string;
  content_type: string | null;
  utxo_outpoint: string | null;
}

export interface InscriptionInput {
  sat_number: string;
  inscription_id: string;
  content_type: string | null;
  utxo_outpoint: string | null;
}

export function upsertInscription(db: Database.Database, ins: InscriptionInput): void {
  db.prepare(`
    INSERT INTO inscriptions (sat_number, inscription_id, content_type, utxo_outpoint)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(sat_number) DO UPDATE SET
      inscription_id = excluded.inscription_id,
      content_type = excluded.content_type,
      utxo_outpoint = excluded.utxo_outpoint
  `).run(ins.sat_number, ins.inscription_id, ins.content_type, ins.utxo_outpoint);
}

export function getInscriptionsBySeries(db: Database.Database, seriesId: number): InscriptionRow[] {
  const series = SERIES[seriesId - 1];
  if (!series) return [];
  const start = series.satStart.toString();
  const end = series.satEnd.toString();
  return db.prepare(`
    SELECT i.* FROM inscriptions i
    WHERE CAST(i.sat_number AS REAL) >= CAST(? AS REAL)
      AND CAST(i.sat_number AS REAL) <= CAST(? AS REAL)
  `).all(start, end) as InscriptionRow[];
}

export interface TraceStateRow {
  id: number;
  last_traced_txid: string | null;
  last_traced_depth: number;
  total_utxos_found: number;
  fee_sats_retraced: string;
  last_run: string;
  status: string;
}

export interface TraceStateInput {
  last_traced_txid: string | null;
  last_traced_depth: number;
  total_utxos_found: number;
  fee_sats_retraced: string;
  status: string;
}

export function getTraceState(db: Database.Database): TraceStateRow | null {
  return (db.prepare("SELECT * FROM trace_state WHERE id = 1").get() as TraceStateRow) || null;
}

// --- Trace Queue ---

export interface QueueItem {
  id: number;
  outpoint: string;
  sat_range_start: string;
  sat_range_end: string;
  depth: number;
  input_offset: string;
}

export function enqueueTrace(
  db: Database.Database,
  outpoint: string,
  satStart: string,
  satEnd: string,
  depth: number,
  inputOffset: string = "0"
): boolean {
  // Skip if this exact outpoint+range is already queued
  const existing = db.prepare(
    "SELECT 1 FROM trace_queue WHERE outpoint = ? AND sat_range_start = ? AND sat_range_end = ?"
  ).get(outpoint, satStart, satEnd);
  if (existing) return false;
  db.prepare(`
    INSERT INTO trace_queue (outpoint, sat_range_start, sat_range_end, depth, input_offset)
    VALUES (?, ?, ?, ?, ?)
  `).run(outpoint, satStart, satEnd, depth, inputOffset);
  return true;
}

export function dequeueTrace(db: Database.Database): QueueItem | null {
  const row = db.prepare(
    "SELECT * FROM trace_queue ORDER BY id ASC LIMIT 1"
  ).get() as QueueItem | undefined;
  if (!row) return null;
  db.prepare("DELETE FROM trace_queue WHERE id = ?").run(row.id);
  return row;
}

export function peekTrace(db: Database.Database): QueueItem | null {
  const row = db.prepare(
    "SELECT * FROM trace_queue ORDER BY id ASC LIMIT 1"
  ).get() as QueueItem | undefined;
  return row || null;
}

export function deleteTrace(db: Database.Database, id: number): void {
  db.prepare("DELETE FROM trace_queue WHERE id = ?").run(id);
}

export function deleteQueuedRangesCoveredByLiveUtxos(db: Database.Database, seriesId: number): number {
  const series = SERIES[seriesId - 1];
  if (!series) return 0;

  const queued = db.prepare(`
    SELECT id, sat_range_start, sat_range_end
    FROM trace_queue
    WHERE sat_range_start <= ? AND sat_range_end >= ?
  `).all(series.satEnd.toString(), series.satStart.toString()) as Array<{
    id: number;
    sat_range_start: string;
    sat_range_end: string;
  }>;

  const live = db.prepare(`
    SELECT sat_range_start, sat_range_end
    FROM utxos
    WHERE sat_range_start <= ? AND sat_range_end >= ? AND spent = 0
    ORDER BY sat_range_start, sat_range_end
  `).all(series.satEnd.toString(), series.satStart.toString()) as Array<{
    sat_range_start: string;
    sat_range_end: string;
  }>;

  const liveIntervals = live.map((row) => ({
    start: BigInt(row.sat_range_start),
    end: BigInt(row.sat_range_end),
  }));

  const coveredByLive = (start: bigint, end: bigint) => {
    let cursor = start;
    for (const interval of liveIntervals) {
      if (interval.end < cursor) continue;
      if (interval.start > cursor) return false;
      if (interval.end >= end) return true;
      cursor = interval.end + 1n;
    }
    return false;
  };

  const deleteStmt = db.prepare("DELETE FROM trace_queue WHERE id = ?");
  let deleted = 0;
  const tx = db.transaction(() => {
    for (const row of queued) {
      if (coveredByLive(BigInt(row.sat_range_start), BigInt(row.sat_range_end))) {
        deleteStmt.run(row.id);
        deleted++;
      }
    }
  });
  tx();

  return deleted;
}

export function getQueueSize(db: Database.Database): number {
  const row = db.prepare("SELECT COUNT(*) as cnt FROM trace_queue").get() as { cnt: number };
  return row.cnt;
}

export interface TraceAccounting {
  live_sats: bigint;
  queued_sats: bigint;
  accounted_sats: bigint;
  duplicate_sats: bigint;
  target_sats: bigint;
  gap_sats: bigint;
}

export interface TraceGap {
  start: bigint;
  end: bigint;
  count: bigint;
}

export function getTraceAccounting(db: Database.Database, seriesId: number): TraceAccounting {
  const series = SERIES[seriesId - 1];
  if (!series) {
    return {
      live_sats: 0n,
      queued_sats: 0n,
      accounted_sats: 0n,
      duplicate_sats: 0n,
      target_sats: 0n,
      gap_sats: 0n,
    };
  }

  const start = series.satStart.toString();
  const end = series.satEnd.toString();
  const liveRows = db.prepare(`
    SELECT sat_range_start, sat_range_end
    FROM utxos
    WHERE sat_range_start <= ? AND sat_range_end >= ? AND spent = 0
  `).all(end, start) as Array<{ sat_range_start: string; sat_range_end: string }>;

  const queuedRows = db.prepare(`
    SELECT sat_range_start, sat_range_end
    FROM trace_queue
    WHERE sat_range_start <= ? AND sat_range_end >= ?
  `).all(end, start) as Array<{ sat_range_start: string; sat_range_end: string }>;

  const seriesStart = series.satStart;
  const seriesEnd = series.satEnd;
  const rangeSize = (row: { sat_range_start: string; sat_range_end: string }) => {
    const clippedStart = BigInt(row.sat_range_start) > seriesStart ? BigInt(row.sat_range_start) : seriesStart;
    const clippedEnd = BigInt(row.sat_range_end) < seriesEnd ? BigInt(row.sat_range_end) : seriesEnd;
    return clippedStart <= clippedEnd ? clippedEnd - clippedStart + 1n : 0n;
  };

  const liveSats = liveRows.reduce((sum, row) => sum + rangeSize(row), 0n);
  const queuedSats = queuedRows.reduce((sum, row) => sum + rangeSize(row), 0n);
  const rawAccountedSats = liveSats + queuedSats;
  const intervals = [...liveRows, ...queuedRows]
    .map((row) => ({
      start: BigInt(row.sat_range_start) > seriesStart ? BigInt(row.sat_range_start) : seriesStart,
      end: BigInt(row.sat_range_end) < seriesEnd ? BigInt(row.sat_range_end) : seriesEnd,
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

  let accountedSats = 0n;
  let currentStart: bigint | null = null;
  let currentEnd: bigint | null = null;
  for (const interval of intervals) {
    if (currentStart === null || currentEnd === null) {
      currentStart = interval.start;
      currentEnd = interval.end;
      continue;
    }
    if (interval.start <= currentEnd + 1n) {
      if (interval.end > currentEnd) currentEnd = interval.end;
      continue;
    }
    accountedSats += currentEnd - currentStart + 1n;
    currentStart = interval.start;
    currentEnd = interval.end;
  }
  if (currentStart !== null && currentEnd !== null) {
    accountedSats += currentEnd - currentStart + 1n;
  }

  const targetSats = series.satCount;

  return {
    live_sats: liveSats,
    queued_sats: queuedSats,
    accounted_sats: accountedSats,
    duplicate_sats: rawAccountedSats - accountedSats,
    target_sats: targetSats,
    gap_sats: targetSats - accountedSats,
  };
}

export function getTraceGaps(db: Database.Database, seriesId: number): TraceGap[] {
  const series = SERIES[seriesId - 1];
  if (!series) return [];

  const start = series.satStart.toString();
  const end = series.satEnd.toString();
  const rows = [
    ...db.prepare(`
      SELECT sat_range_start, sat_range_end
      FROM utxos
      WHERE sat_range_start <= ? AND sat_range_end >= ? AND spent = 0
    `).all(end, start),
    ...db.prepare(`
      SELECT sat_range_start, sat_range_end
      FROM trace_queue
      WHERE sat_range_start <= ? AND sat_range_end >= ?
    `).all(end, start),
  ] as Array<{ sat_range_start: string; sat_range_end: string }>;

  const intervals = rows
    .map((row) => ({
      start: BigInt(row.sat_range_start) > series.satStart ? BigInt(row.sat_range_start) : series.satStart,
      end: BigInt(row.sat_range_end) < series.satEnd ? BigInt(row.sat_range_end) : series.satEnd,
    }))
    .filter((range) => range.start <= range.end)
    .sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);

  const gaps: TraceGap[] = [];
  let cursor = series.satStart;
  for (const interval of intervals) {
    if (interval.start > cursor) {
      gaps.push({
        start: cursor,
        end: interval.start - 1n,
        count: interval.start - cursor,
      });
    }
    if (interval.end >= cursor) cursor = interval.end + 1n;
  }

  if (cursor <= series.satEnd) {
    gaps.push({
      start: cursor,
      end: series.satEnd,
      count: series.satEnd - cursor + 1n,
    });
  }

  return gaps;
}

export function clearQueue(db: Database.Database): void {
  db.prepare("DELETE FROM trace_queue").run();
}

export function getUnspentUtxos(db: Database.Database, seriesId: number): UtxoRow[] {
  const series = SERIES[seriesId - 1];
  if (!series) return [];
  const start = series.satStart.toString();
  const end = series.satEnd.toString();
  return db.prepare(`
    SELECT * FROM utxos
    WHERE sat_range_start <= ? AND sat_range_end >= ? AND spent = 0
    ORDER BY sat_count DESC
  `).all(end, start) as UtxoRow[];
}

export function updateTraceState(db: Database.Database, state: TraceStateInput): void {
  db.prepare(`
    INSERT INTO trace_state (id, last_traced_txid, last_traced_depth, total_utxos_found, fee_sats_retraced, status, last_run)
    VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      last_traced_txid = excluded.last_traced_txid,
      last_traced_depth = excluded.last_traced_depth,
      total_utxos_found = excluded.total_utxos_found,
      fee_sats_retraced = excluded.fee_sats_retraced,
      status = excluded.status,
      last_run = datetime('now')
  `).run(state.last_traced_txid, state.last_traced_depth, state.total_utxos_found, state.fee_sats_retraced, state.status);
}
