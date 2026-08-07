import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { loadConfig } from "@/core/job-config";

export const dynamic = "force-dynamic";

export async function POST() {
  const cfg = loadConfig();
  if (!cfg?.job) {
    return NextResponse.json(
      { error: "No active job. Complete the wizard first." },
      { status: 400 }
    );
  }

  const dbPath = process.env.DATABASE_PATH || "./track-prefix.db";
  const lockPath = `${path.resolve(dbPath)}.trace.lock`;
  if (fs.existsSync(lockPath)) {
    return NextResponse.json(
      {
        error: "A tracer is already running (lock file present).",
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
      env: { ...process.env },
    }
  );
  child.unref();

  return NextResponse.json({
    ok: true,
    message: `Tracer started for ${cfg.job.prefix} series ${cfg.job.seriesId}`,
    pid: child.pid ?? null,
  });
}
