"use client";

import { useBlockHeight } from "./use-block-height";

const NEXT_SERIES = {
  id: 2,
  nameLength: 10,
  count: "11,881,376",
  targetBlock: 1568922,
  year: "2038",
  satStart: "2,087,457,921,658,138",
  satEnd: "2,087,457,933,539,513",
};

export function NextTarget() {
  const { blockHeight } = useBlockHeight();

  const current = blockHeight ?? 0;
  const remaining = Math.max(0, NEXT_SERIES.targetBlock - current);
  const progress = Math.min(
    100,
    Math.round((current / NEXT_SERIES.targetBlock) * 10000) / 100
  );
  const estimatedDays = Math.round((remaining * 10) / 1440);
  const estimatedYears = (estimatedDays / 365).toFixed(1);

  const barWidth = 40;
  const filled = Math.round((progress / 100) * barWidth);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(barWidth - filled);

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface">
      <h2 className="text-terminal-dim text-xs tracking-widest mb-3">
        NEXT TARGET SERIES {NEXT_SERIES.id} MINING PROGRESS
      </h2>
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-terminal-amber font-mono text-sm">{bar}</span>
          <span className="text-terminal-bright text-sm font-bold">
            {progress}%
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-terminal-dim">Target Block</span>
            <div className="text-terminal-bright">
              {NEXT_SERIES.targetBlock.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Blocks Remaining</span>
            <div className="text-terminal-amber">
              {remaining.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <span className="text-terminal-dim">Est. Time</span>
            <div className="text-terminal-bright">~{estimatedYears} years</div>
          </div>
          <div>
            <span className="text-terminal-dim">Sats to Unlock</span>
            <div className="text-terminal-bright">
              {NEXT_SERIES.count}
            </div>
          </div>
        </div>
        <div className="text-terminal-dim text-xs mt-2">
          Range: {NEXT_SERIES.satStart} → {NEXT_SERIES.satEnd}
        </div>
      </div>
    </section>
  );
}
