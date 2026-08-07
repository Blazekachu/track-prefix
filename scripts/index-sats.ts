import { getDb } from "../src/db/index";
import {
  CoinbaseTracer,
  TracePausedError,
  TraceStoppedError,
  type TracerMode,
} from "../src/indexer/tracer";
import { InscriptionScanner } from "../src/indexer/scanner";
import { loadConfig } from "../src/core/job-config";
import { getActiveDbPath } from "../src/core/job-library";
import { SERIES } from "../src/core/series";
import { originBlockHeights } from "../src/core/origin-blocks";
import { createProvider } from "../src/providers/create-provider";
import { clearControl, writeControl } from "../src/core/trace-control";
import { getTraceState, updateTraceState } from "../src/db/queries";
import fs from "node:fs";
import path from "node:path";

const mode = (process.argv[2] || "trace") as TracerMode;
const skipScan = process.argv.includes("--no-scan");
const validModes = ["trace", "refresh", "repair"];

if (!validModes.includes(mode)) {
  console.log("Usage: npm run index [trace|refresh|repair] [--no-scan]");
  console.log("");
  console.log("  trace      — Initial discovery + resume from where you left off (default)");
  console.log("  refresh    — Re-check all live UTXOs for movements, then trace new paths");
  console.log("  repair     — Reseed missing coverage into the queue without processing it");
  console.log("  --no-scan  — Skip inscription scanning after tracing");
  process.exitCode = 1;
} else {
  void main();
}

async function main() {
  const delayMs = parseInt(process.env.API_DELAY_MS || "350", 10);
  const dbPath = process.env.DATABASE_PATH || getActiveDbPath();
  const lockFile = `${path.resolve(dbPath)}.trace.lock`;

  console.log(`[indexer] track-prefix sat indexer — mode: ${mode}`);
  console.log(`[indexer] DB: ${dbPath} | API delay: ${delayMs}ms`);
  console.log("[indexer] Pause/stop from the dashboard, or Ctrl+C here.\n");

  clearControl();

  const isPidAlive = (pid: number): boolean => {
    if (!pid || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === "EPERM") return true;
      return false;
    }
  };

  const STALE_LOCK_AGE_MS = 30 * 60 * 1000;

  const writeLockMetadata = (fd: number): void => {
    fs.writeFileSync(
      fd,
      JSON.stringify(
        {
          pid: process.pid,
          mode,
          started_at: new Date().toISOString(),
        },
        null,
        2
      )
    );
  };

  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockFile, "wx");
    writeLockMetadata(lockFd);
  } catch {
    let priorContent = "";
    let reclaim = false;
    try {
      priorContent = fs.readFileSync(lockFile, "utf8");
      const prior = JSON.parse(priorContent) as {
        pid?: number;
        started_at?: string;
        mode?: string;
      };
      const priorPid = Number(prior.pid ?? 0);
      const priorAgeMs = prior.started_at
        ? Date.now() - new Date(prior.started_at).getTime()
        : 0;
      if (!isPidAlive(priorPid) && priorAgeMs > STALE_LOCK_AGE_MS) {
        console.warn(
          `[indexer] Reclaiming stale lock — pid ${priorPid} is dead, lock is ${Math.round(priorAgeMs / 60000)} min old (mode=${prior.mode ?? "unknown"}).`
        );
        fs.unlinkSync(lockFile);
        reclaim = true;
      }
    } catch {
      // Unparseable lock — do not reclaim
    }
    if (reclaim) {
      try {
        lockFd = fs.openSync(lockFile, "wx");
        writeLockMetadata(lockFd);
      } catch {
        console.error(
          "[indexer] Lock reclaim raced with another process; aborting safely."
        );
        process.exitCode = 1;
        return;
      }
    } else {
      console.error(
        `[indexer] Another tracer appears to be running. Lock: ${lockFile}`
      );
      console.error(priorContent || "(lock file unreadable)");
      console.error(
        "[indexer] Use Pause/Stop in the dashboard, or delete the lock if the process is dead."
      );
      process.exitCode = 1;
      return;
    }
  }

  const db = getDb(dbPath);

  const onSignal = () => {
    console.log("\n[indexer] Signal received — requesting pause…");
    writeControl("pause");
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const cfg = loadConfig();
    let provider;
    let providerLabel = "public-esplora";
    try {
      const created = createProvider(cfg, delayMs);
      provider = created.provider;
      providerLabel = created.label;
      if (cfg?.mode === "paid_api" && cfg.modeCredentials.apiKey) {
        process.env.ESPLORA_API_KEY = cfg.modeCredentials.apiKey;
      }
      if (cfg?.mode === "public_api" || cfg?.mode === "paid_api") {
        const { resolveEsploraBases } = await import("../src/providers/mode");
        const bases = resolveEsploraBases({
          mode: cfg.mode,
          modeCredentials: cfg.modeCredentials,
        });
        process.env.ESPLORA_BASE_URLS = bases.join(",");
      }
    } catch (e) {
      console.error(`[indexer] ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 1;
      return;
    }

    console.log(`[indexer] Provider: ${providerLabel}`);

    let satStart: bigint;
    let satEnd: bigint;
    let seriesId = 1;
    if (cfg?.job) {
      satStart = BigInt(cfg.job.satStart);
      satEnd = BigInt(cfg.job.satEnd);
      seriesId = cfg.job.seriesId;
    } else {
      const series1 = SERIES[0];
      satStart = series1.satStart;
      satEnd = series1.satEnd;
      seriesId = series1.id;
      console.warn(
        "[indexer] No config.json job — falling back to SERIES[0] (legacy BHANG S1)."
      );
    }

    const tracer = new CoinbaseTracer(
      db,
      provider,
      { start: satStart, end: satEnd },
      originBlockHeights(satStart, satEnd),
      seriesId
    );

    await tracer.run(mode);

    if (mode === "trace" && !skipScan) {
      console.log("\n=== Inscription Scanning ===\n");
      const scanner = new InscriptionScanner(db, provider);
      await scanner.scanSeries(seriesId);
    } else if (skipScan) {
      console.log("[indexer] Inscription scanning skipped (--no-scan)");
    }

    console.log("\n[indexer] Done.");
  } catch (err) {
    if (err instanceof TracePausedError || err instanceof TraceStoppedError) {
      console.log(`[indexer] ${err.message}`);
      console.log(
        "[indexer] Queue preserved. Resume with Start tracer / npm run trace:sats"
      );
      process.exitCode = 0;
    } else {
      const state = getTraceState(db);
      try {
        updateTraceState(db, {
          last_traced_txid: state?.last_traced_txid ?? null,
          last_traced_depth: state?.last_traced_depth ?? 0,
          total_utxos_found: state?.total_utxos_found ?? 0,
          fee_sats_retraced: state?.fee_sats_retraced ?? "0",
          status: "error",
        });
      } catch {
        /* ignore */
      }
      console.error(
        `\n[indexer] Stopped safely: ${err instanceof Error ? err.message : String(err)}`
      );
      console.error(
        "[indexer] No queue item is deleted until it is fully traced. Fix the issue and rerun the same command to resume."
      );
      process.exitCode = 1;
    }
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    clearControl();
    db.close();
    if (lockFd !== null) {
      fs.closeSync(lockFd);
      try {
        fs.unlinkSync(lockFile);
      } catch {
        // best effort
      }
    }
  }
}
