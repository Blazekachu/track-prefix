import fs from "fs";
import { dbPathResolved, type TraceControlAction } from "./trace-control";
import { isPidAlive } from "./pid";

export function scanLockPath(): string {
  return `${dbPathResolved()}.scan.lock`;
}

export function scanControlPath(): string {
  return `${dbPathResolved()}.scan.control`;
}

export function readScanLock(): {
  pid?: number;
  started_at?: string;
} | null {
  try {
    return JSON.parse(fs.readFileSync(scanLockPath(), "utf8")) as {
      pid?: number;
      started_at?: string;
    };
  } catch {
    return null;
  }
}

export function writeScanControl(action: TraceControlAction): void {
  fs.writeFileSync(scanControlPath(), action, "utf8");
}

export function clearScanControl(): void {
  try {
    fs.unlinkSync(scanControlPath());
  } catch {
    /* ignore */
  }
}

export function readScanControl(): TraceControlAction {
  try {
    const raw = fs.readFileSync(scanControlPath(), "utf8").trim();
    if (raw === "pause" || raw === "stop") return raw;
  } catch {
    /* ignore */
  }
  return "run";
}

export function killLockedScanner(): { killed: boolean; pid: number | null } {
  const lock = readScanLock();
  const pid = Number(lock?.pid ?? 0);
  if (!pid || !isPidAlive(pid)) {
    try {
      fs.unlinkSync(scanLockPath());
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

export function isScanRunning(): boolean {
  const lock = readScanLock();
  const pid = Number(lock?.pid ?? 0);
  return isPidAlive(pid);
}
