import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { loadConfig } from "@/core/job-config";
import {
  assertSingleTraceAllowed,
  getActiveJobEntry,
  getActiveDbPath,
  jobLockPath,
} from "@/core/job-library";

export const dynamic = "force-dynamic";

export async function POST() {
  const cfg = loadConfig();
  if (!cfg?.job) {
    return NextResponse.json(
      { error: "No active job. Complete the wizard or select a job first." },
      { status: 400 }
    );
  }

  try {
    assertSingleTraceAllowed(cfg.mode);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }

  const entry = getActiveJobEntry();
  const dbPath = getActiveDbPath();
  const lockPath = entry ? jobLockPath(entry) : `${path.resolve(dbPath)}.trace.lock`;

  if (fs.existsSync(lockPath)) {
    return NextResponse.json(
      {
        error: "A tracer is already running for this job (lock file present).",
        lockPath,
      },
      { status: 409 }
    );
  }

  const child = spawn(
    "npx",
    ["tsx", "scripts/index-sats.ts", "trace", "--no-scan"],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      shell: true,
      env: {
        ...process.env,
        DATABASE_PATH: dbPath,
      },
    }
  );
  child.unref();

  return NextResponse.json({
    ok: true,
    message: `Tracer started for ${cfg.job.prefix} series ${cfg.job.seriesId}`,
    pid: child.pid ?? null,
    dbPath,
  });
}
