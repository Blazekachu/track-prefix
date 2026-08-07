import { getDb } from "../src/db/index";
import { PublicOrdProvider } from "../src/providers/public-provider";
import { CoinbaseTracer, type TracerMode } from "../src/indexer/tracer";
import { InscriptionScanner } from "../src/indexer/scanner";
import { loadConfig } from "../src/core/job-config";
import { SERIES } from "../src/core/series";
import { originBlockHeights } from "../src/core/origin-blocks";
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
  main();
}

async function main() {
  const delayMs = parseInt(process.env.API_DELAY_MS || "350", 10);
  const dbPath = process.env.DATABASE_PATH || "./track-prefix.db";
  const lockPath = `${path.resolve(dbPath)}.trace.lock`;

  console.log(`[indexer] track-prefix sat indexer — mode: ${mode}`);
  console.log(`[indexer] DB: ${dbPath} | API delay: ${delayMs}ms`);
  console.log("");

  // Probe whether a PID corresponds to a live process. process.kill(pid, 0)
  // is a no-op signal probe: succeeds if the process exists, throws if it
  // does not. EPERM (exists but no signal permission) still counts as alive.
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

  // A refresh that has held the lock longer than this is almost certainly
  // dead (refreshes finish in minutes). Both the dead-PID AND the age check
  // must pass before reclaim, so we never interrupt a slow-but-legit run
  // and never trust a PID that may have been reused by an unrelated process.
  const STALE_LOCK_AGE_MS = 30 * 60 * 1000;

  const writeLockMetadata = (fd: number): void => {
    fs.writeFileSync(fd, JSON.stringify({
      pid: process.pid,
      mode,
      started_at: new Date().toISOString(),
    }, null, 2));
  };

  let lockFd: number | null = null;
  try {
    lockFd = fs.openSync(lockPath, "wx");
    writeLockMetadata(lockFd);
  } catch {
    // Lock exists. Reclaim only when BOTH gates pass: the recorded PID is
    // dead AND the lock is older than STALE_LOCK_AGE_MS.
    let priorContent = "";
    let reclaim = false;
    try {
      priorContent = fs.readFileSync(lockPath, "utf8");
      const prior = JSON.parse(priorContent) as { pid?: number; started_at?: string; mode?: string };
      const priorPid = Number(prior.pid ?? 0);
      const priorAgeMs = prior.started_at ? Date.now() - new Date(prior.started_at).getTime() : 0;
      if (!isPidAlive(priorPid) && priorAgeMs > STALE_LOCK_AGE_MS) {
        console.warn(`[indexer] Reclaiming stale lock — pid ${priorPid} is dead, lock is ${Math.round(priorAgeMs / 60000)} min old (mode=${prior.mode ?? "unknown"}).`);
        fs.unlinkSync(lockPath);
        reclaim = true;
      }
    } catch {
      // Unparseable or unreadable lock — treat as opaque, do NOT reclaim.
    }
    if (reclaim) {
      try {
        lockFd = fs.openSync(lockPath, "wx");
        writeLockMetadata(lockFd);
      } catch {
        console.error("[indexer] Lock reclaim raced with another process; aborting safely.");
        process.exitCode = 1;
        return;
      }
    } else {
      console.error(`[indexer] Another tracer appears to be running. Lock: ${lockPath}`);
      console.error(priorContent || "(lock file unreadable)");
      console.error("[indexer] Stop the other tracer first. If it is definitely dead, delete the lock file and rerun.");
      process.exitCode = 1;
      return;
    }
  }

  const db = getDb(dbPath);
  try {
    const provider = new PublicOrdProvider(delayMs);
    const cfg = loadConfig();
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
      console.warn("[indexer] No config.json job — falling back to SERIES[0] (legacy BHANG S1).");
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
    console.error(`\n[indexer] Stopped safely: ${err instanceof Error ? err.message : String(err)}`);
    console.error("[indexer] No queue item is deleted until it is fully traced. Fix the issue and rerun the same command to resume.");
    process.exitCode = 1;
  } finally {
    db.close();
    if (lockFd !== null) {
      fs.closeSync(lockFd);
      try {
        fs.unlinkSync(lockPath);
      } catch {
        // best effort
      }
    }
  }
}
