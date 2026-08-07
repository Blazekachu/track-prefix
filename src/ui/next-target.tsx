"use client";

import { useCallback, useEffect, useState } from "react";

type NextUnmined = {
  id: number;
  nameLength: number;
  satCount: string;
  satStart: string;
  satEnd: string;
  targetBlock: number;
  miningPercent: number;
  blocksRemaining: number;
  estimatedYears: number;
};

export function NextTarget() {
  const [next, setNext] = useState<NextUnmined | null>(null);
  const [allMined, setAllMined] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/prefix-series");
      if (!res.ok) return;
      const json = await res.json();
      if (json.nextUnmined) {
        setNext(json.nextUnmined as NextUnmined);
        setAllMined(false);
      } else {
        setNext(null);
        setAllMined((json.series as unknown[])?.length > 0);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (allMined && !next) {
    return (
      <section className="border border-terminal-green/20 rounded p-4 bg-terminal-surface text-sm text-terminal-dim">
        All series for this prefix are mined. Use per-series track controls above.
      </section>
    );
  }

  if (!next) return null;

  const barWidth = 40;
  const filled = Math.round((next.miningPercent / 100) * barWidth);
  const bar =
    "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-terminal-dim text-xs tracking-widest">
          NEXT TARGET — SERIES {next.id} MINING PROGRESS
        </h2>
        <span className="text-terminal-amber text-sm font-bold">
          {next.miningPercent}%
        </span>
      </div>
      <p className="text-terminal-dim text-xs mb-3">
        Read-only forecast. UTXO tracking unlocks when block{" "}
        {next.targetBlock.toLocaleString("en-US")} is reached.
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-terminal-amber font-mono text-sm">{bar}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-terminal-dim">Target Block</span>
            <div className="text-terminal-bright">
              {next.targetBlock.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Blocks Remaining</span>
            <div className="text-terminal-amber">
              {next.blocksRemaining.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Est. Time</span>
            <div className="text-terminal-bright">
              ~{next.estimatedYears.toFixed(1)} years
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Sats to Unlock</span>
            <div className="text-terminal-bright">
              {Number(next.satCount).toLocaleString("en-US")}
            </div>
          </div>
        </div>
        <div className="text-terminal-dim text-xs mt-2">
          Range: {Number(next.satStart).toLocaleString("en-US")} →{" "}
          {Number(next.satEnd).toLocaleString("en-US")} · {next.nameLength}
          -letter
        </div>
      </div>
    </section>
  );
}
