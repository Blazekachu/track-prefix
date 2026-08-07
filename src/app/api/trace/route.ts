import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { getTraceState, getQueueSize, getUtxoStats } from "@/db/queries";
import { SERIES } from "@/core/series";

export async function GET() {
  const db = getDb();
  try {
    const state = getTraceState(db);
    const queueSize = getQueueSize(db);
    const stats = getUtxoStats(db, 1);
    const series1 = SERIES[0];
    const totalSupply = Number(series1.satCount);

    return NextResponse.json({
      status: state?.status ?? "idle",
      lastRun: state?.last_run ?? null,
      totalUtxosFound: state?.total_utxos_found ?? 0,
      queueSize,
      feeSatsRetraced: state?.fee_sats_retraced ?? "0",
      trackedSats: stats.total_sats,
      totalSupply,
      liveUtxos: stats.utxo_count,
      wallets: stats.wallet_count,
    });
  } finally {
    db.close();
  }
}
