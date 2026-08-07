import fs from "fs";
import path from "path";

export type TraceControlAction = "run" | "pause" | "stop";

export function dbPathResolved(): string {
  return path.resolve(process.env.DATABASE_PATH || "./track-prefix.db");
}

export function lockPath(): string {
  return `${dbPathResolved()}.trace.lock`;
}

export function controlPath(): string {
  return `${dbPathResolved()}.trace.control`;
}

export function readLock(): { pid?: number; mode?: string; started_at?: string } | null {
  try {
    return JSON.parse(fs.readFileSync(lockPath(), "utf8")) as {
      pid?: number;
      mode?: string;
      started_at?: string;
    };
  } catch {
    return null;
  }
}

export function writeControl(action: TraceControlAction): void {
  fs.writeFileSync(controlPath(), action, "utf8");
}

export function clearControl(): void {
  try {
    fs.unlinkSync(controlPath());
  } catch {
    /* ignore */
  }
}

export function readControl(): TraceControlAction {
  try {
    const raw = fs.readFileSync(controlPath(), "utf8").trim();
    if (raw === "pause" || raw === "stop") return raw;
  } catch {
    /* ignore */
  }
  return "run";
}

export function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    return err.code === "EPERM";
  }
}

/** Best-effort stop of the tracer process recorded in the lock file. */
export function killLockedTracer(): { killed: boolean; pid: number | null } {
  const lock = readLock();
  const pid = Number(lock?.pid ?? 0);
  if (!pid || !isPidAlive(pid)) {
    try {
      fs.unlinkSync(lockPath());
    } catch {
      /* ignore */
    }
    return { killed: false, pid: pid || null };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  return { killed: true, pid };
}
