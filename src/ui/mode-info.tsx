"use client";

import { useEffect, useState } from "react";
import type { DataMode } from "@/core/job-config";
import { MODE_CAPABILITIES } from "@/core/mode-copy";

export function ModeInfoBanner() {
  const [mode, setMode] = useState<DataMode | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        if (!res.ok) return;
        const json = await res.json();
        if (json.config?.mode) setMode(json.config.mode as DataMode);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  if (!mode) return null;
  const info = MODE_CAPABILITIES[mode];

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface text-sm">
      <h2 className="text-terminal-dim text-xs tracking-widest mb-2">
        DATA MODE — {info.label.toUpperCase()}
      </h2>
      <p className="text-terminal-bright mb-3">{info.summary}</p>
      <div className="grid md:grid-cols-3 gap-3 text-xs text-terminal-dim">
        <div>
          <div className="text-terminal-green mb-1">UTXO position track</div>
          <p>{info.utxoTrace}</p>
        </div>
        <div>
          <div className="text-terminal-amber mb-1">Inscription track</div>
          <p>{info.inscriptions}</p>
        </div>
        <div>
          <div className="text-terminal-dim mb-1">Requirements</div>
          <p>{info.requirements}</p>
        </div>
      </div>
    </section>
  );
}
