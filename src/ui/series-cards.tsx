"use client";

import { useEffect, useState } from "react";

type Job = {
  prefix: string;
  seriesId: number;
  nameLength: number;
  satStart: string;
  satEnd: string;
  satCount: string;
};

type SeriesRow = {
  id: number;
  name_length: number;
  sat_count: number;
  target_block: number;
  mined: number;
};

export function SeriesCards() {
  const [job, setJob] = useState<Job | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [cfgRes, seriesRes] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/series"),
        ]);
        if (cfgRes.ok) {
          const cfg = await cfgRes.json();
          setJob(cfg.config?.job ?? null);
        }
        if (seriesRes.ok) setSeries(await seriesRes.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <section>
      <h2 className="text-terminal-dim text-xs tracking-widest mb-3">
        ACTIVE JOB
      </h2>
      {job ? (
        <div className="border border-terminal-green/30 bg-terminal-green/5 rounded p-4">
          <div className="text-terminal-green text-lg font-bold">
            {job.prefix}
          </div>
          <div className="text-sm text-terminal-bright mt-1">
            Series {job.seriesId} · {job.nameLength}-letter ·{" "}
            {Number(job.satCount).toLocaleString("en-US")} sats · mined
          </div>
          <div className="text-xs text-terminal-dim mt-2">
            sats {Number(job.satStart).toLocaleString("en-US")} →{" "}
            {Number(job.satEnd).toLocaleString("en-US")}
          </div>
        </div>
      ) : (
        <p className="text-terminal-dim text-sm">No active job.</p>
      )}

      {series.length > 0 && (
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {series.map((s) => (
            <div
              key={s.id}
              className={`border p-3 rounded text-center ${
                s.mined
                  ? "border-terminal-green/30 bg-terminal-green/5"
                  : "border-terminal-border"
              }`}
            >
              <div className="text-terminal-dim text-xs">S{s.id}</div>
              <div className="text-sm font-bold mt-1">
                {s.mined ? (
                  <span className="text-terminal-green">MINED</span>
                ) : (
                  <span className="text-terminal-amber">FUTURE</span>
                )}
              </div>
              <div className="text-terminal-bright text-sm mt-1">
                {Number(s.sat_count).toLocaleString("en-US")}
              </div>
              <div className="text-terminal-dim text-xs">{s.name_length}L</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
