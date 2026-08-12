import Database from "better-sqlite3";
import { writeFileSync } from "fs";
import { resolve } from "path";
import {
  getSeries,
  getUtxoStats,
  getTraceState,
  getQueueSize,
  getUtxosBySeries,
  getInscriptionsBySeries,
  getTraceAccounting,
} from "@/db/queries";
import { getWalletLabel } from "@/core/wallet-labels";
import { esploraGet } from "@/providers/esplora-client";
import {
  jobDbPath,
  jobSnapshotPath,
  type JobEntry,
} from "@/core/job-library";

const SPECIAL_SATS: Array<{
  sat: bigint;
  type: string;
  label: string;
  symbol: string;
  color: string;
  name: string;
  desc: string;
}> = [];

function getUtxoRarity(satRangeStart: string, satRangeEnd: string) {
  const start = BigInt(satRangeStart);
  const end = BigInt(satRangeEnd);
  const tags: typeof SPECIAL_SATS = [];
  for (const ss of SPECIAL_SATS) {
    if (ss.sat >= start && ss.sat <= end) {
      tags.push(ss);
    }
  }
  return tags.length
    ? tags.map((t) => ({
        type: t.type,
        label: t.label,
        symbol: t.symbol,
        color: t.color,
        name: t.name,
        desc: t.desc,
      }))
    : undefined;
}

async function getCurrentBlockHeight(): Promise<number> {
  try {
    const text = await esploraGet<string>("/blocks/tip/height", {
      parse: "text",
      timeoutMs: 5_000,
    });
    return parseInt(text, 10);
  } catch {
    return 0;
  }
}

async function fetchAddressBalance(address: string): Promise<number | null> {
  try {
    const data = await esploraGet<{
      chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
      mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
    }>(`/address/${address}`);
    const chain =
      (data.chain_stats?.funded_txo_sum ?? 0) -
      (data.chain_stats?.spent_txo_sum ?? 0);
    const mem =
      (data.mempool_stats?.funded_txo_sum ?? 0) -
      (data.mempool_stats?.spent_txo_sum ?? 0);
    return chain + mem;
  } catch {
    return null;
  }
}

async function computeMultiRangeWallets(
  utxos: Array<{
    address: string;
    outpoint: string;
    sat_count: number;
    wallet_label?: { label: string; kind: string };
  }>
): Promise<
  Array<{
    address: string;
    range_count: number;
    outpoint_count: number;
    tracked_sats: number;
    btc_balance_sats: number | null;
    wallet_label?: { label: string; kind: string };
  }>
> {
  type Agg = {
    ranges: number;
    outpoints: Set<string>;
    tracked_sats: number;
    label?: { label: string; kind: string };
  };
  const byAddr: Record<string, Agg> = {};
  for (const u of utxos) {
    if (!byAddr[u.address]) {
      byAddr[u.address] = {
        ranges: 0,
        outpoints: new Set(),
        tracked_sats: 0,
        label: u.wallet_label,
      };
    }
    byAddr[u.address].ranges++;
    byAddr[u.address].outpoints.add(u.outpoint);
    byAddr[u.address].tracked_sats += Number(u.sat_count);
  }
  const multi = Object.entries(byAddr).filter(([, w]) => w.ranges >= 2);
  multi.sort((a, b) => b[1].tracked_sats - a[1].tracked_sats);

  const balances = new Map<string, number | null>();
  for (const [addr] of multi) {
    balances.set(addr, await fetchAddressBalance(addr));
  }

  return multi.map(([addr, w]) => ({
    address: addr,
    range_count: w.ranges,
    outpoint_count: w.outpoints.size,
    tracked_sats: w.tracked_sats,
    btc_balance_sats: balances.get(addr) ?? null,
    ...(w.label && { wallet_label: w.label }),
  }));
}

export async function exportSnapshotForJob(entry: JobEntry): Promise<{
  outPath: string;
  seriesCount: number;
  utxoCount: number;
  inscriptionCount: number;
  blockHeight: number;
}> {
  const db = new Database(jobDbPath(entry), { readonly: true });
  try {
    const blockHeight = await getCurrentBlockHeight();
    const series = getSeries(db);
    const traceState = getTraceState(db);
    const queueSize = getQueueSize(db);

    const seriesData = [];
    for (const s of series) {
      const stats = getUtxoStats(db, s.id);
      const utxos = getUtxosBySeries(db, s.id).filter((u) => !u.spent);
      const inscriptions = getInscriptionsBySeries(db, s.id);
      const utxoRows = utxos.map((u) => {
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
      const multiRangeWallets = await computeMultiRangeWallets(utxoRows);
      seriesData.push({
        ...s,
        stats,
        utxos: utxoRows,
        multi_range_wallets: multiRangeWallets,
        inscriptions,
      });
    }

    const primarySeriesId = series[0]?.id ?? entry.seriesId;
    const acc = getTraceAccounting(db, primarySeriesId);
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

    const outPath = resolve(jobSnapshotPath(entry));
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

    return {
      outPath,
      seriesCount: series.length,
      utxoCount: seriesData.reduce((a, s) => a + s.utxos.length, 0),
      inscriptionCount: seriesData.reduce((a, s) => a + s.inscriptions.length, 0),
      blockHeight,
    };
  } finally {
    db.close();
  }
}
