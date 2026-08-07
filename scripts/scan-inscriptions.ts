/**
 * Inscription scanner worker.
 * Usage: npx tsx scripts/scan-inscriptions.ts
 */
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/db/index";
import { loadConfig } from "../src/core/job-config";
import { getActiveDbPath } from "../src/core/job-library";
import { modeCanInscriptionScan } from "../src/core/mode-copy";
import { createProvider } from "../src/providers/create-provider";
import {
  clearScanControl,
  writeScanControl,
} from "../src/core/scan-control";
import {
  InscriptionScanner,
  ScanPausedError,
  ScanStoppedError,
  type InscriptionScanMode,
} from "../src/indexer/scanner";
import {
  getScanState,
  getTraceAccounting,
  getTraceState,
  updateScanState,
} from "../src/db/queries";
import { isPidAlive } from "../src/core/pid";

async function main() {
  const scanModeArg = (process.argv[2] ||
    process.env.SCAN_MODE ||
    "first_sat") as InscriptionScanMode;
  const scanMode: InscriptionScanMode =
    scanModeArg === "every_sat" ? "every_sat" : "first_sat";

  const cfg = loadConfig();
  if (!cfg?.job) {
    console.error("[scanner] No active job in config.json");
    process.exitCode = 1;
    return;
  }
  if (!modeCanInscriptionScan(cfg.mode)) {
    console.error(
      `[scanner] Mode ${cfg.mode} cannot scan inscriptions. Use btc_ord or public/paid API.`
    );
    process.exitCode = 1;
    return;
  }
  if (scanMode === "every_sat" && cfg.mode !== "btc_ord") {
    console.error(
      "[scanner] every_sat is only allowed for btc_ord (local ord node)."
    );
    process.exitCode = 1;
    return;
  }

  const dbPath = process.env.DATABASE_PATH || getActiveDbPath();
  process.env.DATABASE_PATH = dbPath;
  const lockFile = `${path.resolve(dbPath)}.scan.lock`;

  console.log(`[scanner] track-prefix inscription scan`);
  console.log(`[scanner] DB: ${dbPath}`);
  console.log(`[scanner] Data mode: ${cfg.mode} | scan: ${scanMode}`);

  clearScanControl();

  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockFile, "wx");
    fs.writeFileSync(
      lockFd,
      JSON.stringify(
        { pid: process.pid, started_at: new Date().toISOString() },
        null,
        2
      )
    );
  } catch {
    let reclaim = false;
    try {
      const prior = JSON.parse(fs.readFileSync(lockFile, "utf8")) as {
        pid?: number;
      };
      if (!isPidAlive(Number(prior.pid ?? 0))) {
        fs.unlinkSync(lockFile);
        reclaim = true;
      }
    } catch {
      /* ignore */
    }
    if (reclaim) {
      lockFd = fs.openSync(lockFile, "wx");
      fs.writeFileSync(
        lockFd,
        JSON.stringify(
          { pid: process.pid, started_at: new Date().toISOString() },
          null,
          2
        )
      );
    } else {
      console.error(`[scanner] Another scan is running. Lock: ${lockFile}`);
      process.exitCode = 1;
      return;
    }
  }

  const db = getDb(dbPath);
  const onSignal = () => {
    console.log("\n[scanner] Signal — requesting pause…");
    writeScanControl("pause");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const trace = getTraceState(db);
    const acc = getTraceAccounting(db, cfg.job.seriesId);
    if (trace?.status !== "complete" || acc.gap_sats !== 0n) {
      console.error(
        `[scanner] UTXO position track is not complete (status=${trace?.status ?? "none"}, gap=${acc.gap_sats}). Finish tracing first.`
      );
      process.exitCode = 1;
      return;
    }

    const { provider, label } = createProvider(cfg, 100);
    console.log(`[scanner] Provider: ${label}`);

    const scanner = new InscriptionScanner(db, provider);
    await scanner.scanSeries(cfg.job.seriesId, scanMode);
    console.log("[scanner] Done.");
  } catch (err) {
    if (err instanceof ScanPausedError || err instanceof ScanStoppedError) {
      console.log(`[scanner] ${err.message}`);
      console.log("[scanner] Resume with Start on the Inscription track panel.");
      process.exitCode = 0;
    } else {
      const state = getScanState(db);
      try {
        updateScanState(db, {
          status: "error",
          utxos_total: state?.utxos_total ?? 0,
          utxos_done: state?.utxos_done ?? 0,
          sats_checked: state?.sats_checked ?? 0,
          inscriptions_found: state?.inscriptions_found ?? 0,
          last_outpoint: state?.last_outpoint ?? null,
          scan_mode: state?.scan_mode ?? scanMode,
        });
      } catch {
        /* ignore */
      }
      console.error(
        `[scanner] ${err instanceof Error ? err.message : String(err)}`
      );
      process.exitCode = 1;
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    clearScanControl();
    db.close();
    if (lockFd !== null) {
      fs.closeSync(lockFd);
      try {
        fs.unlinkSync(lockFile);
      } catch {
        /* ignore */
      }
    }
  }
}

void main();
