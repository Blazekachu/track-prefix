import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { loadConfig } from "@/core/job-config";
import { getActiveDbPath } from "@/core/job-library";
import { modeCanInscriptionScan } from "@/core/mode-copy";
import { getDb } from "@/db/index";
import { getTraceState, getTraceAccounting } from "@/db/queries";
import { clearScanControl } from "@/core/scan-control";
import { readLock } from "@/core/trace-control";
import { isPidAlive } from "@/core/pid";

export const dynamic = "force-dynamic";

type Body = { mode?: "first_sat" | "every_sat" };

export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    /* default first_sat */
  }

  const scanMode = body.mode === "every_sat" ? "every_sat" : "first_sat";

  const cfg = loadConfig();
  if (!cfg?.job) {
    return NextResponse.json({ error: "No active job." }, { status: 400 });
  }
  if (!modeCanInscriptionScan(cfg.mode)) {
    return NextResponse.json(
      {
        error:
          "Inscription scan requires btc_ord (or public/paid API). BTC node alone has no inscription index.",
      },
      { status: 403 }
    );
  }
  if (scanMode === "every_sat" && cfg.mode !== "btc_ord") {
    return NextResponse.json(
      {
        error:
          "Scan every sat is only available for BTC node + ord (local ord).",
      },
      { status: 403 }
    );
  }

  const lock = readLock();
  if (isPidAlive(Number(lock?.pid ?? 0))) {
    return NextResponse.json(
      { error: "UTXO tracer is still running. Pause/stop it first." },
      { status: 409 }
    );
  }

  const dbPath = getActiveDbPath();
  const db = getDb(dbPath);
  try {
    const trace = getTraceState(db);
    const acc = getTraceAccounting(db, cfg.job.seriesId);
    if (trace?.status !== "complete" || acc.gap_sats !== 0n) {
      return NextResponse.json(
        {
          error:
            "UTXO position track must be complete (gap 0) before inscription scan.",
        },
        { status: 409 }
      );
    }
  } finally {
    db.close();
  }

  process.env.DATABASE_PATH = dbPath;
  const lockPath = `${path.resolve(dbPath)}.scan.lock`;
  if (fs.existsSync(lockPath)) {
    return NextResponse.json(
      { error: "An inscription scan is already running.", lockPath },
      { status: 409 }
    );
  }

  clearScanControl();

  const child = spawn(
    "npx",
    ["tsx", "scripts/scan-inscriptions.ts", scanMode],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      shell: true,
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
        SCAN_MODE: scanMode,
      },
    }
  );
  child.unref();

  return NextResponse.json({
    ok: true,
    message:
      scanMode === "every_sat"
        ? `Every-sat inscription scan started for ${cfg.job.prefix} series ${cfg.job.seriesId}`
        : `First-sat inscription scan started for ${cfg.job.prefix} series ${cfg.job.seriesId} (1 sat per UTXO)`,
    mode: scanMode,
    pid: child.pid ?? null,
  });
}
