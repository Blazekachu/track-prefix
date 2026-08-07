"use client";

import { useEffect, useState } from "react";

interface Utxo {
  outpoint: string;
  sat_range_start: string;
  address: string;
  sat_count: number;
  spent: number;
  last_checked: string;
}

export function ActivityFeed() {
  const [recent, setRecent] = useState<Utxo[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/utxos?series=1");
        if (res.ok) {
          const data: Utxo[] = await res.json();
          const sorted = data
            .sort((a, b) => b.last_checked.localeCompare(a.last_checked))
            .slice(0, 10);
          setRecent(sorted);
        }
      } catch {
        // silent fail
      }
    }
    load();
  }, []);

  const truncate = (s: string) =>
    s.length > 16 ? s.slice(0, 8) + "..." + s.slice(-6) : s;

  const timeAgo = (dateStr: string) => {
    const now = Date.now();
    const then = new Date(dateStr + "Z").getTime();
    const diffMs = now - then;
    const hours = Math.floor(diffMs / 3600000);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "just now";
  };

  if (recent.length === 0) {
    return (
      <section className="border border-terminal-border rounded p-4 bg-terminal-surface">
        <h2 className="text-terminal-dim text-xs tracking-widest mb-3">
          RECENT ACTIVITY
        </h2>
        <div className="text-terminal-dim text-sm">
          No activity recorded yet.
        </div>
      </section>
    );
  }

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface">
      <h2 className="text-terminal-dim text-xs tracking-widest mb-3">
        RECENT ACTIVITY
      </h2>
      <div className="space-y-1 text-sm font-mono">
        {recent.map((utxo) => (
          <div key={`${utxo.outpoint}:${utxo.sat_range_start}`} className="flex items-center gap-2">
            <span className="text-terminal-dim">&gt;</span>
            <a
              href={`https://mempool.space/address/${utxo.address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-terminal-green hover:underline"
            >
              {truncate(utxo.address)}
            </a>
            <span className="text-terminal-dim">
              {utxo.spent ? "sent" : "holds"}
            </span>
            <span className="text-terminal-bright">
              {utxo.sat_count.toLocaleString("en-US")} sats
            </span>
            <span className="text-terminal-dim text-xs ml-auto">
              {timeAgo(utxo.last_checked)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
