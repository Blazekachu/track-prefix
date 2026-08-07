"use client";

import { useEffect, useState } from "react";

interface Utxo {
  outpoint: string;
  address: string;
  sat_range_start: string;
  sat_range_end: string;
  sat_count: number;
  spent: number;
  last_moved: string | null;
}

interface Stats {
  utxo_count: number;
  wallet_count: number;
  total_sats: number;
  inscribed_count: number;
}

export function SeriesDetail() {
  const [utxos, setUtxos] = useState<Utxo[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sortBy, setSortBy] = useState<"sat_count" | "address">("sat_count");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  useEffect(() => {
    async function load() {
      try {
        const [utxoRes, statsRes] = await Promise.all([
          fetch("/api/utxos?series=1"),
          fetch("/api/stats?series=1"),
        ]);
        if (utxoRes.ok) setUtxos(await utxoRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch (err) {
        console.error("Failed to load series data:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filtered = search.trim()
    ? utxos.filter(
        (u) =>
          u.address.toLowerCase().includes(search.trim().toLowerCase()) ||
          u.outpoint.toLowerCase().includes(search.trim().toLowerCase())
      )
    : utxos;

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "sat_count") return b.sat_count - a.sat_count;
    return a.address.localeCompare(b.address);
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const truncate = (s: string, len = 12) =>
    s.length > len ? s.slice(0, len) + "..." + s.slice(-6) : s;

  return (
    <section className="border border-terminal-green/20 rounded p-4 bg-terminal-surface">
      <h2 className="text-terminal-green text-xs tracking-widest mb-3">
        SERIES 1 — MINED (308,915,776 SATS)
      </h2>

      {loading ? (
        <div className="text-terminal-dim text-sm">
          Loading<span className="cursor-blink">_</span>
        </div>
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-4 text-sm">
              <div>
                <span className="text-terminal-dim">UTXOs</span>
                <div className="text-terminal-bright font-bold">
                  {stats.utxo_count.toLocaleString("en-US")}
                </div>
              </div>
              <div>
                <span className="text-terminal-dim">Wallets</span>
                <div className="text-terminal-bright font-bold">
                  {stats.wallet_count.toLocaleString("en-US")}
                </div>
              </div>
              <div>
                <span className="text-terminal-dim">Tracked Sats</span>
                <div className="text-terminal-bright font-bold">
                  {stats.total_sats.toLocaleString("en-US")}
                </div>
              </div>
              <div>
                <span className="text-terminal-dim">Inscribed</span>
                <div className="text-terminal-amber font-bold">
                  {stats.inscribed_count.toLocaleString("en-US")}
                </div>
              </div>
            </div>
          )}

          {utxos.length > 0 && (() => {
            const byType: Record<string, { addrs: Set<string>; sats: number }> = {
              Legacy: { addrs: new Set(), sats: 0 },
              "Nested SegWit": { addrs: new Set(), sats: 0 },
              "Native SegWit": { addrs: new Set(), sats: 0 },
              Taproot: { addrs: new Set(), sats: 0 },
            };
            for (const u of utxos) {
              const type = u.address.startsWith("bc1p") ? "Taproot"
                : u.address.startsWith("bc1q") ? "Native SegWit"
                : u.address.startsWith("3") ? "Nested SegWit"
                : "Legacy";
              byType[type].addrs.add(u.address);
              byType[type].sats += u.sat_count;
            }
            return (
              <table className="mb-4 text-xs">
                <thead>
                  <tr className="text-terminal-dim">
                    <th className="text-left pr-8 py-1">TYPE</th>
                    <th className="text-right pr-8 py-1">WALLETS</th>
                    <th className="text-right py-1">SATS</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byType).map(([type, { addrs, sats }]) => (
                    <tr key={type} className="border-t border-terminal-border/30">
                      <td className="text-terminal-dim pr-8 py-1">{type}</td>
                      <td className="text-right text-terminal-bright pr-8 py-1 font-bold">{addrs.size}</td>
                      <td className="text-right text-terminal-green py-1 font-bold">{sats.toLocaleString("en-US")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}

          <div className="mb-3 flex items-center gap-3">
            <span className="text-terminal-dim text-xs">SEARCH:</span>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Enter wallet address or outpoint..."
              className="flex-1 bg-terminal-bg border border-terminal-border rounded px-3 py-1.5 text-sm text-terminal-bright font-mono placeholder:text-terminal-dim/50 focus:outline-none focus:border-terminal-green/60"
            />
            {search && (
              <span className="text-xs text-terminal-dim">
                {sorted.length} result{sorted.length !== 1 ? "s" : ""}
                {sorted.length > 0 && (
                  <span className="text-terminal-green ml-1">
                    — {sorted.reduce((sum, u) => sum + u.sat_count, 0).toLocaleString("en-US")} sats
                  </span>
                )}
              </span>
            )}
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-terminal-dim hover:text-terminal-bright text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {utxos.length === 0 ? (
            <div className="text-terminal-dim text-sm">
              No UTXOs indexed yet. Run: <code className="text-terminal-amber">npm run index</code>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-terminal-dim border-b border-terminal-border">
                    <th className="text-left py-2 pr-4">OUTPOINT</th>
                    <th
                      className="text-left py-2 pr-4 cursor-pointer hover:text-terminal-green"
                      onClick={() => setSortBy("address")}
                    >
                      ADDRESS {sortBy === "address" ? "^" : ""}
                    </th>
                    <th
                      className="text-right py-2 pr-4 cursor-pointer hover:text-terminal-green"
                      onClick={() => setSortBy("sat_count")}
                    >
                      SATS {sortBy === "sat_count" ? "v" : ""}
                    </th>
                    <th className="text-left py-2 pr-4">SAT RANGE</th>
                    <th className="text-left py-2 pr-4">LAST MOVED</th>
                    <th className="text-center py-2">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((utxo) => (
                    <tr
                      key={`${utxo.outpoint}:${utxo.sat_range_start}`}
                      className="border-b border-terminal-border/50 hover:bg-terminal-green/5"
                    >
                      <td className="py-2 pr-4 text-terminal-dim">
                        {truncate(utxo.outpoint, 16)}
                      </td>
                      <td className="py-2 pr-4">
                        <a
                          href={`https://mempool.space/address/${utxo.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-terminal-green hover:underline"
                        >
                          {truncate(utxo.address)}
                        </a>
                      </td>
                      <td className="py-2 pr-4 text-right text-terminal-bright">
                        {utxo.sat_count.toLocaleString("en-US")}
                      </td>
                      <td className="py-2 text-terminal-dim">
                        <a
                          href={`https://ordinals.com/sat/${utxo.sat_range_start}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-terminal-green"
                        >
                          {truncate(utxo.sat_range_start, 10)}
                        </a>
                        {" → "}
                        <a
                          href={`https://ordinals.com/sat/${utxo.sat_range_end}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-terminal-green"
                        >
                          {truncate(utxo.sat_range_end, 10)}
                        </a>
                      </td>
                      <td className="py-2 pr-4 text-terminal-dim">
                        {utxo.last_moved
                          ? utxo.last_moved.substring(0, 10)
                          : "—"}
                      </td>
                      <td className="py-2 text-center">
                        {utxo.spent ? (
                          <span className="text-terminal-red">SPENT</span>
                        ) : (
                          <span className="text-terminal-green">LIVE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-terminal-dim">
                    Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} of {sorted.length.toLocaleString("en-US")}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(1)}
                      disabled={safePage === 1}
                      className="px-2 py-1 border border-terminal-border rounded text-terminal-dim hover:text-terminal-green hover:border-terminal-green/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &laquo;
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                      className="px-2 py-1 border border-terminal-border rounded text-terminal-dim hover:text-terminal-green hover:border-terminal-green/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &lsaquo; Prev
                    </button>
                    <span className="text-terminal-bright px-2">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                      className="px-2 py-1 border border-terminal-border rounded text-terminal-dim hover:text-terminal-green hover:border-terminal-green/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next &rsaquo;
                    </button>
                    <button
                      onClick={() => setPage(totalPages)}
                      disabled={safePage === totalPages}
                      className="px-2 py-1 border border-terminal-border rounded text-terminal-dim hover:text-terminal-green hover:border-terminal-green/50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      &raquo;
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
