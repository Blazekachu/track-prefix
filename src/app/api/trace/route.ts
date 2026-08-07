import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { getTraceState, getQueueSize, getUtxoStats } from "@/db/queries";
import { loadConfig } from "@/core/job-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  try {
    const cfg = loadConfig();
    const seriesId = cfg?.job?.seriesId ?? 1;
    const state = getTraceState(db);
    const queueSize = getQueueSize(db);
    const stats = getUtxoStats(db, seriesId);
    const totalSupply = cfg?.job
      ? Number(cfg.job.satCount)
      : stats.total_sats;

    return NextResponse.json({
      status: state?.status ?? "idle",
      lastRun: state?.last_run ?? null,
      totalUtxosFound: state?.total_utxos_found ?? 0,
      queueSize,
      feeSatsRetraced: state?.fee_sats_retraced ?? "0",
      trackedSats: stats.total_sats,
      totalSupply: cfg?.job ? Number(cfg.job.satCount) : totalSupply,
      liveUtxos: stats.utxo_count,
      wallets: stats.wallet_count,
      job: cfg?.job
        ? {
            prefix: cfg.job.prefix,
            seriesId: cfg.job.seriesId,
            nameLength: cfg.job.nameLength,
            satStart: cfg.job.satStart,
            satEnd: cfg.job.satEnd,
            satCount: cfg.job.satCount,
          }
        : null,
    });
  } finally {
    db.close();
  }
}
