"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataMode } from "@/core/job-config";
import {
  shouldBlockNewTrack,
  isApiRateLimitedMode,
  type JobSummary,
} from "@/core/job-library";

export type { JobSummary };

const STATUS_LABELS: Record<string, string> = {
  idle: "idle",
  tracing: "tracing",
  refreshing: "refreshing",
  paused: "paused",
  complete: "complete",
  error: "error",
};

const NEW_TRACK_BLOCKED_MSG = "Stop present Track to proceed with new";

export function JobLibrary({
  onNewTrack,
  compact = false,
}: {
  onNewTrack?: () => void;
  compact?: boolean;
}) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [mode, setMode] = useState<DataMode>("public_api");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(!compact);

  const load = useCallback(async () => {
    try {
      const [jobsRes, cfgRes] = await Promise.all([
        fetch("/api/jobs"),
        fetch("/api/config"),
      ]);
      if (jobsRes.ok) {
        const json = await jobsRes.json();
        setJobs(json.jobs as JobSummary[]);
        setActiveJobId(json.activeJobId ?? null);
      }
      if (cfgRes.ok) {
        const json = await cfgRes.json();
        if (json.config?.mode) setMode(json.config.mode as DataMode);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  async function selectJob(id: string) {
    if (id === activeJobId) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/jobs/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to switch job");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const blockNewTrack = useMemo(
    () => shouldBlockNewTrack(mode, jobs),
    [mode, jobs]
  );

  if (jobs.length === 0) return null;

  const active = jobs.find((j) => j.isActive) ?? jobs[0];

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface text-sm">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <h2 className="text-terminal-green text-xs tracking-widest">
            TRACKED JOBS
          </h2>
          {!expanded && active && (
            <p className="text-terminal-dim text-xs mt-1">
              Active:{" "}
              <span className="text-terminal-bright">
                {active.prefix} · series {active.seriesId}
              </span>
              {active.isRunning && (
                <span className="text-terminal-amber ml-2">● running</span>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {compact && (
            <button
              type="button"
              className="px-2 py-1 border border-terminal-border text-xs"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Collapse" : "Show all"}
            </button>
          )}
          {onNewTrack && (
            <span className="relative inline-block group">
              <button
                type="button"
                disabled={blockNewTrack}
                aria-disabled={blockNewTrack}
                title={blockNewTrack ? NEW_TRACK_BLOCKED_MSG : undefined}
                className={`px-3 py-1 border text-xs ${
                  blockNewTrack
                    ? "border-terminal-border text-terminal-dim opacity-50 cursor-not-allowed"
                    : "border-terminal-green text-terminal-green hover:bg-terminal-green/10"
                }`}
                onClick={blockNewTrack ? undefined : onNewTrack}
              >
                + New track
              </button>
              {blockNewTrack && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-max max-w-xs rounded border border-terminal-amber/40 bg-black px-2 py-1 text-[10px] text-terminal-amber opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                >
                  {NEW_TRACK_BLOCKED_MSG}
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-terminal-red text-xs mb-2">{error}</p>}

      {expanded && (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className={`border p-3 flex flex-wrap items-center justify-between gap-2 ${
                j.isActive
                  ? "border-terminal-green/60"
                  : "border-terminal-border"
              }`}
            >
              <div>
                <div className="text-terminal-bright font-bold">
                  {j.prefix}
                  <span className="text-terminal-dim font-normal">
                    {" "}
                    · series {j.seriesId}
                  </span>
                  {j.isActive && (
                    <span className="ml-2 text-terminal-green text-xs">
                      ACTIVE
                    </span>
                  )}
                  {j.isRunning && (
                    <span className="ml-2 text-terminal-amber text-xs animate-pulse">
                      ● tracing
                    </span>
                  )}
                </div>
                <div className="text-terminal-dim text-xs mt-1">
                  {Number(j.satCount).toLocaleString("en-US")} sats ·{" "}
                  {j.nameLength}-letter · opened{" "}
                  {j.lastOpenedAt.substring(0, 10)}
                  {j.traceStatus && (
                    <>
                      {" "}
                      ·{" "}
                      {STATUS_LABELS[j.traceStatus] ?? j.traceStatus}
                    </>
                  )}
                  {j.queueSize > 0 && <> · queue {j.queueSize}</>}
                </div>
              </div>
              {!j.isActive && (
                <button
                  type="button"
                  disabled={busy === j.id}
                  className="px-3 py-1 border border-terminal-border text-xs hover:border-terminal-green"
                  onClick={() => void selectJob(j.id)}
                >
                  {busy === j.id ? "Switching…" : "Open"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-terminal-dim text-xs mt-3">
        Each job has its own database under{" "}
        <code className="text-terminal-bright">data/jobs/</code>.
        {isApiRateLimitedMode(mode) ? (
          <>
            {" "}
            Public/paid API mode allows only one tracer at a time — stop the
            present track before starting a new one.
          </>
        ) : (
          <> Node/ord modes can run multiple tracks without this limit.</>
        )}
      </p>
    </section>
  );
}
