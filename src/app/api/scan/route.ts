import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import {
  getScanState,
  getTraceState,
  getTraceAccounting,
  countInscriptions,
} from "@/db/queries";
import { loadConfig } from "@/core/job-config";
import { MODE_CAPABILITIES, modeCanInscriptionScan } from "@/core/mode-copy";
import { isScanRunning } from "@/core/scan-control";
import { readLock } from "@/core/trace-control";
import { isPidAlive } from "@/core/pid";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();
  const db = getDb();
  try {
    const mode = cfg?.mode ?? "public_api";
    const seriesId = cfg?.job?.seriesId ?? 1;
    const scan = getScanState(db);
    const trace = getTraceState(db);
    const acc = getTraceAccounting(db, seriesId);
    const running = isScanRunning();

    const lock = readLock();
    const traceRunning = isPidAlive(Number(lock?.pid ?? 0));

    const positionComplete =
      trace?.status === "complete" &&
      acc.gap_sats === 0n &&
      (acc.target_sats === 0n || acc.accounted_sats >= acc.target_sats);

    const canScan =
      modeCanInscriptionScan(mode) && positionComplete && !traceRunning;

    return NextResponse.json({
      mode,
      modeInfo: MODE_CAPABILITIES[mode],
      canInscriptionScan: modeCanInscriptionScan(mode),
      positionComplete,
      conservation: {
        target: Number(acc.target_sats),
        accounted: Number(acc.accounted_sats),
        gap: Number(acc.gap_sats),
        live: Number(acc.live_sats),
      },
      traceStatus: trace?.status ?? "idle",
      traceRunning,
      status: running
        ? "scanning"
        : (scan?.status ?? "idle"),
      utxosTotal: scan?.utxos_total ?? 0,
      utxosDone: scan?.utxos_done ?? 0,
      satsChecked: scan?.sats_checked ?? 0,
      inscriptionsFound: scan?.inscriptions_found ?? countInscriptions(db),
      lastOutpoint: scan?.last_outpoint ?? null,
      lastRun: scan?.last_run ?? null,
      canScan,
      canEverySat: mode === "btc_ord" && canScan,
      scanMode: scan?.scan_mode ?? "first_sat",
      satsPerUtxo:
        (scan?.scan_mode ?? "first_sat") === "every_sat"
          ? "every sat in each UTXO tracked range (+ outpoint first sat)"
          : "1 sat per UTXO (first sat of the outpoint)",
      blockReason: !modeCanInscriptionScan(mode)
        ? "Current mode has no inscription index. Use BTC + ORD nodes (or public/paid API)."
        : !positionComplete
          ? "Finish UTXO position tracking (gap 0, status complete) before scanning inscriptions."
          : traceRunning
            ? "Pause/stop the UTXO tracer before starting an inscription scan."
            : null,
    });
  } finally {
    db.close();
  }
}
