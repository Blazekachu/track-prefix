"use client";

import { useBlockHeight } from "./use-block-height";

const fmt = (n: number) => n.toLocaleString("en-US");

const SERIES_DATA = [
  { id: 1, nameLength: 11, count: "308.9M", blockStart: 579124, blockEnd: 579125, year: "2019", mined: true },
  { id: 2, nameLength: 10, count: "11.8M", blockStart: 1568922, blockEnd: 1568923, year: "2038", mined: false },
  { id: 3, nameLength: 9, count: "456K", blockStart: 2544826, blockEnd: 2544826, year: "2056", mined: false },
  { id: 4, nameLength: 8, count: "17.5K", blockStart: 3536797, blockEnd: 3536798, year: "2075", mined: false },
  { id: 5, nameLength: 7, count: "676", blockStart: 4530322, blockEnd: 4530322, year: "2094", mined: false },
  { id: 6, nameLength: 6, count: "26", blockStart: 5500597, blockEnd: 5500597, year: "2112", mined: false },
  { id: 7, nameLength: 5, count: "1", blockStart: 6403598, blockEnd: 6403598, year: "~2130", mined: false },
];

export function SeriesCards() {
  const { blockHeight } = useBlockHeight();

  return (
    <section>
      <h2 className="text-terminal-dim text-xs tracking-widest mb-3">
        SERIES OVERVIEW
      </h2>
      <div className="grid grid-cols-7 gap-2">
        {SERIES_DATA.map((s) => {
          const progress = blockHeight && !s.mined
            ? Math.min(100, Math.round((blockHeight / s.blockEnd) * 100))
            : s.mined ? 100 : 0;

          return (
            <div
              key={s.id}
              className={`border p-3 rounded text-center transition-colors cursor-pointer hover:border-terminal-green/50 ${
                s.mined
                  ? "border-terminal-green/30 bg-terminal-green/5"
                  : "border-terminal-border bg-terminal-surface"
              }`}
            >
              <div className="text-terminal-dim text-xs">S{s.id}</div>
              <div className="text-lg font-bold mt-1">
                {s.mined ? (
                  <span className="text-terminal-green">MINED</span>
                ) : (
                  <span className="text-terminal-amber">{progress}%</span>
                )}
              </div>
              <div className="text-terminal-bright text-sm mt-1">{s.count}</div>
              <div className="text-terminal-dim text-xs">{s.nameLength}L</div>
              <div className="text-terminal-dim text-xs mt-1">
                {s.blockStart === s.blockEnd
                  ? `BLK ${fmt(s.blockStart)}`
                  : `BLK ${fmt(s.blockStart)}-${fmt(s.blockEnd)}`}
              </div>
              <div className="text-terminal-dim text-xs">{s.year}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
