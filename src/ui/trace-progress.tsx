"use client";

import { useEffect, useState } from "react";

interface TraceData {
  status: string;
  lastRun: string | null;
  totalUtxosFound: number;
  queueSize: number;
  feeSatsRetraced: string;
  trackedSats: number;
  totalSupply: number;
  liveUtxos: number;
  wallets: number;
  job: {
    prefix: string;
    seriesId: number;
    nameLength: number;
    satStart: string;
    satEnd: string;
    satCount: string;
  } | null;
}

const STATUS_LABELS: Record<string, string> = {
  idle: "IDLE",
  tracing: "TRACING",
  refreshing: "REFRESHING",
  paused: "PAUSED",
  complete: "COMPLETE",
  error: "ERROR",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "text-terminal-dim",
  tracing: "text-terminal-green",
  refreshing: "text-terminal-amber",
  paused: "text-terminal-amber",
  complete: "text-terminal-green",
  error: "text-terminal-red",
};

export function TraceProgress() {
  const [data, setData] = useState<TraceData | null>(null);
  const [starting, setStarting] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/trace");
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, []);

  async function startTrace() {
    setStarting(true);
    setStartMsg(null);
    try {
      const res = await fetch("/api/trace/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start tracer");
      setStartMsg(json.message);
      await load();
    } catch (e) {
      setStartMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  if (!data) {
    return (
      <section className="border border-terminal-border rounded p-4 text-terminal-dim text-sm">
        Loading trace status…
      </section>
    );
  }

  const tracedPercent =
    data.totalSupply > 0
      ? Math.round((data.trackedSats / data.totalSupply) * 10000) / 100
      : 0;
  const untracedSats = Math.max(0, data.totalSupply - data.trackedSats);
  const untracedPercent =
    data.totalSupply > 0
      ? Math.round((untracedSats / data.totalSupply) * 10000) / 100
      : 0;

  const barWidth = 60;
  const tracedFill = Math.round((tracedPercent / 100) * barWidth);
  const bar =
    "\u2588".repeat(tracedFill) + "\u2591".repeat(barWidth - tracedFill);

  const statusLabel = STATUS_LABELS[data.status] ?? data.status.toUpperCase();
  const statusColor = STATUS_COLORS[data.status] ?? "text-terminal-dim";
  const job = data.job;
  const canStart =
    data.status === "idle" ||
    data.status === "paused" ||
    data.status === "error" ||
    (!data.lastRun && data.status !== "tracing");

  return (
    <section className="border border-terminal-green/20 rounded p-4 bg-terminal-surface">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-terminal-green text-xs tracking-widest">
          {job
            ? `${job.prefix.toUpperCase()} · SERIES ${job.seriesId} — TRACE PROGRESS`
            : "TRACE PROGRESS"}
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-terminal-dim">STATUS:</span>
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
          {data.status === "tracing" && (
            <span className="text-terminal-green animate-pulse">●</span>
          )}
          {canStart && (
            <button
              type="button"
              onClick={() => void startTrace()}
              disabled={starting}
              className="px-3 py-1 border border-terminal-green text-terminal-green hover:bg-terminal-green/10"
            >
              {starting ? "Starting…" : "Start tracer"}
            </button>
          )}
        </div>
      </div>

      {startMsg && (
        <p className="text-xs text-terminal-dim mb-3">{startMsg}</p>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-terminal-green font-mono text-sm">{bar}</span>
          <span className="text-terminal-bright text-sm font-bold">
            {tracedPercent}%
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
          <div>
            <span className="text-terminal-dim">Traced</span>
            <div className="text-terminal-green font-bold">
              {data.trackedSats.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Untraced</span>
            <div className="text-terminal-amber font-bold">
              {untracedSats.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Target sats</span>
            <div className="text-terminal-bright font-bold">
              {data.totalSupply.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Queue</span>
            <div className="text-terminal-amber font-bold">
              {data.queueSize.toLocaleString("en-US")} items
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Live UTXOs</span>
            <div className="text-terminal-bright font-bold">
              {data.liveUtxos.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Last Run</span>
            <div className="text-terminal-dim">
              {data.lastRun ? data.lastRun.substring(0, 16) : "Never"}
            </div>
          </div>
        </div>

        <div className="flex gap-6 text-xs text-terminal-dim mt-1">
          <span>
            <span className="text-terminal-green">█</span> Traced:{" "}
            {tracedPercent}%
          </span>
          <span>
            <span className="text-terminal-amber">░</span> Untraced:{" "}
            {untracedPercent}%
          </span>
        </div>
        {job && (
          <div className="text-terminal-dim text-xs mt-2">
            Range: {Number(job.satStart).toLocaleString("en-US")} →{" "}
            {Number(job.satEnd).toLocaleString("en-US")} ({job.satCount} sats)
          </div>
        )}
        {!data.lastRun && (
          <p className="text-terminal-amber text-xs mt-2">
            Wizard saved your job, but the tracer has not run yet. Click{" "}
            <strong>Start tracer</strong> (or run{" "}
            <code>npm run trace:sats</code> in a terminal).
          </p>
        )}
      </div>
    </section>
  );
}
