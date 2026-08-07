"use client";

import { useCallback, useEffect, useState } from "react";

export type PrefixSeriesRow = {
  id: number;
  nameLength: number;
  satCount: string;
  satStart: string;
  satEnd: string;
  firstBlock: number;
  targetBlock: number;
  mined: boolean;
  miningPercent: number;
  blocksRemaining: number;
  estimatedYears: number;
  trackable: boolean;
  jobId: string | null;
  isActiveJob: boolean;
  traceStatus: string | null;
  isRunning: boolean;
  queueSize: number;
  lastRun: string | null;
};

function fmtSats(n: number | string): string {
  const v = Number(n);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toLocaleString("en-US");
}

function fmtBlockRange(first: number, target: number): string {
  if (!first || !target) return "—";
  if (first === target) return first.toLocaleString("en-US");
  return `${first.toLocaleString("en-US")}–${target.toLocaleString("en-US")}`;
}

export function SeriesCards() {
  const [prefix, setPrefix] = useState<string | null>(null);
  const [series, setSeries] = useState<PrefixSeriesRow[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prefix-series");
      if (!res.ok) return;
      const json = await res.json();
      setPrefix(json.prefix as string);
      setSeries(json.series as PrefixSeriesRow[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 8000);
    return () => clearInterval(interval);
  }, [load]);

  async function runTrace(
    seriesId: number,
    mode: "trace" | "refresh" = "trace"
  ) {
    setBusy(seriesId);
    setMsg(null);
    try {
      await fetch("/api/trace/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume", seriesId }),
      });
      const res = await fetch("/api/trace/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, seriesId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start tracer");
      setMsg(json.message);
      await load();
      window.dispatchEvent(new Event("track-prefix:series-changed"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function control(seriesId: number, action: "pause" | "stop") {
    setBusy(seriesId);
    setMsg(null);
    try {
      const res = await fetch("/api/trace/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, seriesId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Failed to ${action}`);
      setMsg(json.message);
      await load();
      window.dispatchEvent(new Event("track-prefix:series-changed"));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (series.length === 0) {
    return (
      <section className="text-terminal-dim text-sm">
        Loading prefix series…
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-terminal-dim text-xs tracking-widest mb-1">
        PREFIX SERIES — MINING FORECAST
      </h2>
      <p className="text-terminal-dim text-xs mb-3">
        {prefix ? (
          <>
            All series for <strong className="text-terminal-bright">{prefix}</strong>.
            Unmined rows are read-only progress toward target block. UTXO track
            controls unlock once mined.
          </>
        ) : (
          "Loading…"
        )}
      </p>

      {msg && <p className="text-terminal-dim text-xs mb-3">{msg}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        {series.map((s) => {
          const running =
            s.isRunning ||
            s.traceStatus === "tracing" ||
            s.traceStatus === "refreshing";
          const canTrack =
            s.trackable &&
            !running &&
            (s.traceStatus === "idle" ||
              s.traceStatus === "paused" ||
              s.traceStatus === "error" ||
              !s.lastRun);
          const canRefresh =
            s.trackable && !running && s.traceStatus === "complete";

          return (
            <div
              key={s.id}
              className={`border p-3 rounded text-center flex flex-col gap-2 ${
                s.isActiveJob
                  ? "border-terminal-green/50 bg-terminal-green/5"
                  : s.mined
                    ? "border-terminal-green/20"
                    : "border-terminal-border bg-terminal-surface/50"
              }`}
            >
              <div className="text-terminal-dim text-xs">S{s.id}</div>
              <div className="text-sm font-bold">
                {s.mined ? (
                  <span className="text-terminal-green">MINED</span>
                ) : (
                  <span className="text-terminal-amber">
                    {s.miningPercent}%
                  </span>
                )}
              </div>
              <div className="text-terminal-bright text-sm">
                {fmtSats(s.satCount)}
              </div>
              <div className="text-terminal-dim text-[10px]">
                BLK {fmtBlockRange(s.firstBlock, s.targetBlock)}
              </div>
              <div className="text-terminal-dim text-xs">{s.nameLength}L</div>

              {!s.trackable && (
                <p className="text-[10px] text-terminal-dim leading-snug">
                  Forecast only — tracking unlocks at block{" "}
                  {s.targetBlock.toLocaleString("en-US")}
                </p>
              )}

              {s.trackable && (
                <div className="flex flex-wrap gap-1 justify-center mt-auto pt-1">
                  {canTrack && (
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => void runTrace(s.id, "trace")}
                      className="px-2 py-0.5 border border-terminal-green text-terminal-green text-[10px]"
                    >
                      {busy === s.id
                        ? "…"
                        : s.traceStatus === "paused"
                          ? "Resume"
                          : "Start"}
                    </button>
                  )}
                  {canRefresh && (
                    <button
                      type="button"
                      disabled={busy === s.id}
                      onClick={() => void runTrace(s.id, "refresh")}
                      className="px-2 py-0.5 border border-terminal-amber text-terminal-amber text-[10px]"
                    >
                      Refresh
                    </button>
                  )}
                  {running && (
                    <>
                      <button
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => void control(s.id, "pause")}
                        className="px-2 py-0.5 border border-terminal-amber text-terminal-amber text-[10px]"
                      >
                        Pause
                      </button>
                      <button
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => void control(s.id, "stop")}
                        className="px-2 py-0.5 border border-terminal-red text-terminal-red text-[10px]"
                      >
                        Stop
                      </button>
                    </>
                  )}
                </div>
              )}

              {s.trackable && s.traceStatus && s.traceStatus !== "idle" && (
                <div className="text-[10px] text-terminal-dim uppercase">
                  {s.traceStatus}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
