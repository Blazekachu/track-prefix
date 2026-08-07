"use client";

import { useCallback, useEffect, useState } from "react";

type ScanData = {
  mode: string;
  canInscriptionScan: boolean;
  positionComplete: boolean;
  conservation: {
    target: number;
    accounted: number;
    gap: number;
    live: number;
  };
  status: string;
  utxosTotal: number;
  utxosDone: number;
  satsChecked: number;
  inscriptionsFound: number;
  lastRun: string | null;
  canScan: boolean;
  blockReason: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  idle: "IDLE",
  scanning: "SCANNING",
  paused: "PAUSED",
  complete: "COMPLETE",
  error: "ERROR",
};

const STATUS_COLORS: Record<string, string> = {
  idle: "text-terminal-dim",
  scanning: "text-terminal-amber",
  paused: "text-terminal-amber",
  complete: "text-terminal-green",
  error: "text-terminal-red",
};

export function InscriptionProgress() {
  const [data, setData] = useState<ScanData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scan");
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 4000);
    const onChange = () => void load();
    window.addEventListener("track-prefix:series-changed", onChange);
    return () => {
      clearInterval(interval);
      window.removeEventListener("track-prefix:series-changed", onChange);
    };
  }, [load]);

  async function startScan() {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/scan/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      const res = await fetch("/api/scan/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start scan");
      setMsg(json.message);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function control(action: "pause" | "stop") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/scan/control", {
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
        Loading inscription track…
      </section>
    );
  }

  const running = data.status === "scanning";
  const pct =
    data.utxosTotal > 0
      ? Math.round((data.utxosDone / data.utxosTotal) * 10000) / 100
      : data.status === "complete"
        ? 100
        : 0;
  const barWidth = 60;
  const fill = Math.round((pct / 100) * barWidth);
  const bar =
    "\u2588".repeat(fill) + "\u2591".repeat(barWidth - fill);

  const canStart =
    data.canScan &&
    !running &&
    (data.status === "idle" ||
      data.status === "paused" ||
      data.status === "error" ||
      data.status === "complete" ||
      !data.lastRun);

  const statusLabel = STATUS_LABELS[data.status] ?? data.status.toUpperCase();
  const statusColor = STATUS_COLORS[data.status] ?? "text-terminal-dim";

  return (
    <section className="border border-terminal-amber/30 rounded p-4 bg-terminal-surface">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h2 className="text-terminal-amber text-xs tracking-widest">
          INSCRIPTION TRACK
        </h2>
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="text-terminal-dim">STATUS:</span>
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
          {running && (
            <span className="text-terminal-amber animate-pulse">●</span>
          )}
          {canStart && (
            <button
              type="button"
              onClick={() => void startScan()}
              disabled={busy}
              className="px-3 py-1 border border-terminal-amber text-terminal-amber hover:bg-terminal-amber/10"
            >
              {busy
                ? "…"
                : data.status === "paused"
                  ? "Resume"
                  : data.status === "complete"
                    ? "Re-scan"
                    : "Start scan"}
            </button>
          )}
          {running && (
            <>
              <button
                type="button"
                onClick={() => void control("pause")}
                disabled={busy}
                className="px-3 py-1 border border-terminal-amber text-terminal-amber"
              >
                Pause
              </button>
              <button
                type="button"
                onClick={() => void control("stop")}
                disabled={busy}
                className="px-3 py-1 border border-terminal-red text-terminal-red"
              >
                Stop
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <p className="text-xs text-terminal-dim mb-3">{msg}</p>}

      <div className="text-xs text-terminal-dim mb-3 space-y-1">
        <p>
          DB verify — conservation gap{" "}
          <span
            className={
              data.conservation.gap === 0
                ? "text-terminal-green"
                : "text-terminal-red"
            }
          >
            {data.conservation.gap}
          </span>
          {" · "}
          accounted {data.conservation.accounted.toLocaleString("en-US")} /{" "}
          {data.conservation.target.toLocaleString("en-US")} · UTXO status{" "}
          {data.positionComplete ? (
            <span className="text-terminal-green">complete</span>
          ) : (
            <span className="text-terminal-amber">not ready</span>
          )}
        </p>
        {data.blockReason && (
          <p className="text-terminal-amber">{data.blockReason}</p>
        )}
        {!data.blockReason && data.canInscriptionScan && (
          <p>
            Samples sats inside each live UTXO via{" "}
            {data.mode === "btc_ord" ? "local ord" : "public sat API"} after
            position track is complete.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <span className="text-terminal-amber font-mono text-sm">{bar}</span>
        <span className="text-terminal-bright text-sm font-bold">{pct}%</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <span className="text-terminal-dim">UTXOs scanned</span>
          <div className="text-terminal-bright font-bold">
            {data.utxosDone.toLocaleString("en-US")} /{" "}
            {data.utxosTotal.toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <span className="text-terminal-dim">Sats checked</span>
          <div className="text-terminal-bright font-bold">
            {data.satsChecked.toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <span className="text-terminal-dim">Inscriptions</span>
          <div className="text-terminal-amber font-bold">
            {data.inscriptionsFound.toLocaleString("en-US")}
          </div>
        </div>
        <div>
          <span className="text-terminal-dim">Last run</span>
          <div className="text-terminal-dim">
            {data.lastRun
              ? data.lastRun.replace("T", " ").substring(0, 19)
              : "Never"}
          </div>
        </div>
      </div>
    </section>
  );
}
