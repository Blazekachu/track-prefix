/**
 * Export tracker DB state to a static JSON snapshot.
 * Run: npx tsx scripts/export-snapshot.ts
 * Output: ../wtf/projects/bhang.wtf/public/tracker-data.json
 */
import { getDb } from "../src/db/index";
import { getSeries, getUtxoStats, getTraceState, getQueueSize, getUtxosBySeries, getInscriptionsBySeries, getTraceAccounting } from "../src/db/queries";
import { getWalletLabel } from "../src/core/wallet-labels";
import { esploraGet } from "../src/providers/esplora-client";
import { writeFileSync } from "fs";
import { resolve } from "path";

const db = getDb();

// ─── Rare Sat Definitions ───
// Special sats within BHANG ranges that have ordinals rarity properties
const SPECIAL_SATS: Array<{ sat: bigint; type: string; label: string; symbol: string; color: string; name: string; desc: string }> = [
  { sat: 1773906250000000n, type: "uncommon", label: "Uncommon", symbol: "◆", color: "#70a0ff", name: "bhanggsozvd", desc: "First sat of block 579,125" },
  { sat: 1773906116093771n, type: "palindrome", label: "Palindrome", symbol: "⟐", color: "#ff70d0", name: "bhangrzprys", desc: "Sat number reads same forwards/backwards" },
  { sat: 1773906226093771n, type: "palindrome", label: "Palindrome", symbol: "⟐", color: "#ff70d0", name: "bhangisxebm", desc: "Sat number reads same forwards/backwards" },
  // Future series (will activate when mined)
  { sat: 2087457929687500n, type: "uncommon", label: "Uncommon", symbol: "◆", color: "#70a0ff", name: "bhangilegj", desc: "First sat of block 1,568,923" },
  { sat: 2099981444339814n, type: "uncommon", label: "Uncommon", symbol: "◆", color: "#70a0ff", name: "bhangbgt", desc: "First sat of block 3,536,798" },
];

function getUtxoRarity(sat_range_start: string, sat_range_end: string) {
  const start = BigInt(sat_range_start);
  const end = BigInt(sat_range_end);
  const tags: typeof SPECIAL_SATS = [];
  for (const ss of SPECIAL_SATS) {
    if (ss.sat >= start && ss.sat <= end) {
      tags.push(ss);
    }
  }
  return tags.length ? tags.map(t => ({ type: t.type, label: t.label, symbol: t.symbol, color: t.color, name: t.name, desc: t.desc })) : undefined;
}

// All Esplora reads route through the shared client (src/providers/esplora-client),
// which handles per-provider cooldowns, the global rate limiter, and the
// persisted provider health shared with the refresh step (so a provider the
// refresh just got 429'd on is skipped here too). Height/balances are
// display-only, so on total provider failure we degrade gracefully (0 / null)
// rather than aborting the export.

// Fetch current block height. Returns 0 if every provider is unavailable.
async function getCurrentBlockHeight(): Promise<number> {
  try {
    const text = await esploraGet<string>("/blocks/tip/height", { parse: "text", timeoutMs: 5_000 });
    return parseInt(text, 10);
  } catch {
    console.warn("Could not fetch block height from any provider, using 0");
    return 0;
  }
}

// Fetch full BTC balance (chain + mempool, in sats) for a single address.
// Returns null if every provider is unavailable.
async function fetchAddressBalance(address: string): Promise<number | null> {
  try {
    const data = await esploraGet<{
      chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
      mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    }>(`/address/${address}`);
    const chain = (data.chain_stats?.funded_txo_sum ?? 0) - (data.chain_stats?.spent_txo_sum ?? 0);
    const mem = (data.mempool_stats?.funded_txo_sum ?? 0) - (data.mempool_stats?.spent_txo_sum ?? 0);
    return chain + mem;
  } catch {
    return null;
  }
}

// Aggregate UTXO rows by address, keep only wallets holding >=2 BHANG sat
// ranges, fetch each wallet's full BTC balance through the shared client, and
// return them sorted by tracked BHANG sats descending. Balances are fetched
// serially (not in parallel bursts) — the shared client's global rate limiter
// paces them, which is what keeps providers from rate-limiting/banning us.
async function computeMultiRangeWallets(
  utxos: Array<{ address: string; outpoint: string; sat_count: number; wallet_label?: { label: string; kind: string } }>
): Promise<Array<{ address: string; range_count: number; outpoint_count: number; bhang_sats: number; btc_balance_sats: number | null; wallet_label?: { label: string; kind: string } }>> {
  type Agg = { ranges: number; outpoints: Set<string>; bhang_sats: number; label?: { label: string; kind: string } };
  const byAddr: Record<string, Agg> = {};
  for (const u of utxos) {
    if (!byAddr[u.address]) byAddr[u.address] = { ranges: 0, outpoints: new Set(), bhang_sats: 0, label: u.wallet_label };
    byAddr[u.address].ranges++;
    byAddr[u.address].outpoints.add(u.outpoint);
    byAddr[u.address].bhang_sats += Number(u.sat_count);
  }
  const multi = Object.entries(byAddr).filter(([, w]) => w.ranges >= 2);
  multi.sort((a, b) => b[1].bhang_sats - a[1].bhang_sats);

  // Fetch balances serially through the shared client's global rate limiter.
  // No parallel bursts (those are what trip provider rate-limits); a stalled
  // request only delays itself, bounded by the client's per-request timeout.
  const balances = new Map<string, number | null>();
  let done = 0;
  for (const [addr] of multi) {
    balances.set(addr, await fetchAddressBalance(addr));
    done++;
    process.stdout.write(`\r  balances fetched: ${done}/${multi.length}`);
  }
  process.stdout.write("\n");

  return multi.map(([addr, w]) => ({
    address: addr,
    range_count: w.ranges,
    outpoint_count: w.outpoints.size,
    bhang_sats: w.bhang_sats,
    btc_balance_sats: balances.get(addr) ?? null,
    ...(w.label && { wallet_label: w.label }),
  }));
}

async function main() {
const blockHeight = await getCurrentBlockHeight();

const series = getSeries(db);
const traceState = getTraceState(db);
const queueSize = getQueueSize(db);

const seriesData = [];
for (const s of series) {
  const stats = getUtxoStats(db, s.id);
  const utxos = getUtxosBySeries(db, s.id).filter(u => !u.spent);
  const inscriptions = getInscriptionsBySeries(db, s.id);
  const utxoRows = utxos.map(u => {
    const rarity = getUtxoRarity(u.sat_range_start, u.sat_range_end);
    const wallet = getWalletLabel(u.address);
    return {
      outpoint: u.outpoint,
      address: u.address,
      sat_range_start: u.sat_range_start,
      sat_range_end: u.sat_range_end,
      sat_count: u.sat_count,
      input_offset: u.input_offset,
      last_moved: u.last_moved,
      first_seen: u.first_seen,
      ...(rarity && { rarity }),
      ...(wallet && { wallet_label: wallet }),
    };
  });
  const multi_range_wallets = await computeMultiRangeWallets(utxoRows);
  seriesData.push({
    ...s,
    stats,
    utxos: utxoRows,
    multi_range_wallets,
    inscriptions,
  });
}

// Sat conservation — every BHANG sat must sit in a live UTXO or the trace queue.
const acc = getTraceAccounting(db, 1);
const conservation = {
  target: Number(acc.target_sats),
  live_sats: Number(acc.live_sats),
  queued_sats: Number(acc.queued_sats),
  accounted: Number(acc.accounted_sats),
  gap: Number(acc.gap_sats),
  duplicate: Number(acc.duplicate_sats),
};

const snapshot = {
  exported_at: new Date().toISOString(),
  snapshot_block_height: blockHeight,
  conservation,
  trace: {
    status: traceState?.status ?? "idle",
    last_run: traceState?.last_run ?? null,
    total_utxos_found: traceState?.total_utxos_found ?? 0,
    fee_sats_retraced: traceState?.fee_sats_retraced ?? "0",
    queue_size: queueSize,
  },
  series: seriesData,
};

const outPath = resolve(__dirname, "../../bhang.wtf/tracker-data.json");
writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`Snapshot exported to ${outPath}`);
console.log(`Series: ${series.length}, UTXOs: ${seriesData.reduce((a, s) => a + s.utxos.length, 0)}, Inscriptions: ${seriesData.reduce((a, s) => a + s.inscriptions.length, 0)}, Block: ${blockHeight}`);

db.close();
}

main();
