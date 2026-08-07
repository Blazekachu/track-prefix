import { NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { loadConfig } from "@/core/job-config";
import {
  assertSingleTraceAllowed,
  ensureJobForSeries,
  ensureJobStorage,
  getActiveJobEntry,
  getActiveDbPath,
  jobLockPath,
} from "@/core/job-library";
import { esploraGet } from "@/providers/esplora-client";

export const dynamic = "force-dynamic";

type RunBody = { mode?: "trace" | "refresh"; seriesId?: number };

async function fetchTipHeight(): Promise<number> {
  const text = await esploraGet<string>("/blocks/tip/height", {
    parse: "text",
    timeoutMs: 8_000,
  });
  const height = parseInt(text, 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("Invalid tip height from providers.");
  }
  return height;
}

async function maybeSelectSeries(seriesId?: number): Promise<void> {
  if (seriesId == null) return;
  const cfg = loadConfig();
  if (!cfg?.job) throw new Error("No active prefix job.");
  const tipHeight = await fetchTipHeight();
  ensureJobForSeries({
    prefix: cfg.job.prefix,
    seriesId,
    tipHeight,
  });
}

export async function POST(req: Request) {
  let body: RunBody = {};
  try {
    body = (await req.json()) as RunBody;
  } catch {
    /* default trace mode */
  }

  const tracerMode = body.mode === "refresh" ? "refresh" : "trace";

  try {
    await maybeSelectSeries(body.seriesId);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: body.seriesId != null ? 403 : 400 }
    );
  }

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
  if (entry) {
    ensureJobStorage(entry);
  }
  const dbPath = getActiveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
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

  // Touch-open DB so schema exists before the detached tracer starts.
  try {
    const { getDb } = await import("@/db/index");
    const db = getDb(dbPath);
    db.close();
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not create job database.",
        code: "JOB_STORAGE_MISSING",
      },
      { status: 503 }
    );
  }

  const child = spawn(
    "npx",
    ["tsx", "scripts/index-sats.ts", tracerMode, "--no-scan"],
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
    message:
      tracerMode === "refresh"
        ? `Refresh started for ${cfg.job.prefix} series ${cfg.job.seriesId}`
        : `Tracer started for ${cfg.job.prefix} series ${cfg.job.seriesId}`,
    mode: tracerMode,
    pid: child.pid ?? null,
    dbPath,
  });
}
