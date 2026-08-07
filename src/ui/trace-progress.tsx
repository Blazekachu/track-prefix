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

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trace");
        if (res.ok) setData(await res.json());
      } catch {}
    }
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const tracedPercent =
    data.totalSupply > 0
      ? Math.round((data.trackedSats / data.totalSupply) * 10000) / 100
      : 0;
  const untracedSats = data.totalSupply - data.trackedSats;
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

  return (
    <section className="border border-terminal-green/20 rounded p-4 bg-terminal-surface">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-terminal-green text-xs tracking-widest">
          SERIES 1 — TRACE PROGRESS
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-terminal-dim">STATUS:</span>
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
          {data.status === "tracing" && (
            <span className="text-terminal-green animate-pulse">●</span>
          )}
        </div>
      </div>

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
            <span className="text-terminal-dim">Total Supply</span>
            <div className="text-terminal-bright font-bold">
              {data.totalSupply.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Fee Sats Retraced</span>
            <div className="text-[#D4AF37] font-bold">
              {parseInt(data.feeSatsRetraced).toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Queue</span>
            <div className="text-terminal-amber font-bold">
              {data.queueSize.toLocaleString("en-US")} items
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
        <div className="text-terminal-dim text-xs mt-2">
          Range: 1,773,906,020,861,562 → 1,773,906,329,777,337
        </div>
      </div>
    </section>
  );
}
