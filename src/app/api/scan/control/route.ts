import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { getScanState, updateScanState } from "@/db/queries";
import {
  clearScanControl,
  killLockedScanner,
  readScanLock,
  writeScanControl,
} from "@/core/scan-control";

export const dynamic = "force-dynamic";

type Body = { action?: "pause" | "stop" | "resume" };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "pause" && action !== "stop" && action !== "resume") {
    return NextResponse.json(
      { error: "action must be pause | stop | resume" },
      { status: 400 }
    );
  }

  if (action === "resume") {
    clearScanControl();
    return NextResponse.json({
      ok: true,
      message: "Control cleared — click Start to resume inscription scan.",
    });
  }

  writeScanControl(action);

  if (action === "stop") {
    await new Promise((r) => setTimeout(r, 1000));
    const { killed, pid } = killLockedScanner();
    const db = getDb();
    try {
      const state = getScanState(db);
      updateScanState(db, {
        status: "paused",
        utxos_total: state?.utxos_total ?? 0,
        utxos_done: state?.utxos_done ?? 0,
        sats_checked: state?.sats_checked ?? 0,
        inscriptions_found: state?.inscriptions_found ?? 0,
        last_outpoint: state?.last_outpoint ?? null,
      });
    } finally {
      db.close();
    }
    clearScanControl();
    return NextResponse.json({
      ok: true,
      message: killed
        ? `Stopped inscription scan (pid ${pid}). Progress preserved.`
        : "Stop requested. Progress preserved.",
      killed,
      pid,
    });
  }

  const lock = readScanLock();
  return NextResponse.json({
    ok: true,
    message:
      "Pause requested — scanner stops after the current UTXO. Progress preserved.",
    pid: lock?.pid ?? null,
  });
}
