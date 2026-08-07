import type { DataMode } from "./job-config";

/** Minimal job fields needed for client/server new-track policy checks. */
export type JobTraceState = {
  isActive: boolean;
  isRunning: boolean;
  traceStatus: string | null;
};

export const NEW_TRACK_BLOCKED_MSG = "Stop present Track to proceed with new";

export function isApiRateLimitedMode(mode: DataMode): boolean {
  return mode === "public_api" || mode === "paid_api";
}

/** Public/paid API: block new track while any trace is running or paused. */
export function shouldBlockNewTrack(
  mode: DataMode,
  jobs: JobTraceState[]
): boolean {
  if (!isApiRateLimitedMode(mode)) return false;
  if (jobs.some((j) => j.isRunning)) return true;
  const active = jobs.find((j) => j.isActive);
  if (!active) return false;
  return (
    active.traceStatus === "paused" ||
    active.traceStatus === "tracing" ||
    active.traceStatus === "refreshing"
  );
}
