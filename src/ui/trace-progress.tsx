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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
    const onSeriesChange = () => void load();
    window.addEventListener("track-prefix:series-changed", onSeriesChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("track-prefix:series-changed", onSeriesChange);
    };
  }, []);

  async function runTracer(mode: "trace" | "refresh" = "trace") {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/trace/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const res = await fetch("/api/trace/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start tracer");
      setMsg(json.message);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startTrace() {
    await runTracer("trace");
  }

  async function startRefresh() {
    await runTracer("refresh");
  }

  async function control(action: "pause" | "stop") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trace/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to ${action}`);
      setMsg(json.message);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
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
  const running =
    data.status === "tracing" || data.status === "refreshing";
  const canStart =
    !running &&
    (data.status === "idle" ||
      data.status === "paused" ||
      data.status === "error" ||
      !data.lastRun);
  const canRefresh = !running && data.status === "complete";
  const lastUpdated = data.lastRun
    ? `${data.lastRun.replace("T", " ").substring(0, 19)} UTC`
    : null;

  return (
    <section className="border border-terminal-green/20 rounded p-4 bg-terminal-surface">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-terminal-green text-xs tracking-widest">
          {job
            ? `${job.prefix.toUpperCase()} · SERIES ${job.seriesId} — TRACE PROGRESS`
            : "TRACE PROGRESS"}
        </h2>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-terminal-dim">STATUS:</span>
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
          {running && (
            <span className="text-terminal-green animate-pulse">●</span>
          )}
          {canRefresh && (
            <button
              type="button"
              onClick={() => void startRefresh()}
              disabled={busy}
              className="px-3 py-1 border border-terminal-amber text-terminal-amber hover:bg-terminal-amber/10"
            >
              {busy ? "…" : "Refresh"}
            </button>
          )}
          {canStart && (
            <button
              type="button"
              onClick={() => void startTrace()}
              disabled={busy}
              className="px-3 py-1 border border-terminal-green text-terminal-green hover:bg-terminal-green/10"
            >
              {busy ? "…" : data.status === "paused" ? "Resume" : "Start tracer"}
            </button>
          )}
          {running && (
            <>
              <button
                type="button"
                onClick={() => void control("pause")}
                disabled={busy}
                className="px-3 py-1 border border-terminal-amber text-terminal-amber hover:bg-terminal-amber/10"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void control("stop")}
                disabled={busy}
                className="px-3 py-1 border border-terminal-red text-terminal-red hover:bg-terminal-red/10"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <p className="text-xs text-terminal-dim mb-3">{msg}</p>}

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
            <span className="text-terminal-dim">DB last updated</span>
            <div className="text-terminal-dim">
              {lastUpdated ?? "Never"}
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
            Range: {job.satStart} → {job.satEnd} ({job.satCount} sats)
          </div>
        )}
        {data.status === "complete" && (
          <p className="text-terminal-dim text-xs mt-2">
            Trace complete. The DB is a snapshot — it does not auto-update.
            {lastUpdated ? (
              <>
                {" "}
                Last synced <strong>{lastUpdated}</strong>. Click{" "}
                <strong>Refresh</strong> to check live UTXOs for on-chain
                movements.
              </>
            ) : (
              <>
                {" "}
                Click <strong>Refresh</strong> to check live UTXOs for
                movements.
              </>
            )}
          </p>
        )}
        <p className="text-terminal-dim text-xs mt-2">
          Pause finishes the current queue item then stops. Stop force-ends if
          needed. Queue is kept either way — Resume/Start continues. Closing the
          dashboard terminal does <strong>not</strong> stop a detached tracer;
          use Pause/Stop (or Ctrl+C in the tracer process).
        </p>
        {!data.lastRun && !running && (
          <p className="text-terminal-amber text-xs mt-2">
            Tracer has not run yet. Click <strong>Start tracer</strong>.
          </p>
        )}
      </div>
    </section>
  );
}
