import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { getTraceState, updateTraceState } from "@/db/queries";
import {
  clearControl,
  killLockedTracer,
  readLock,
  writeControl,
} from "@/core/trace-control";

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
    clearControl();
    return NextResponse.json({
      ok: true,
      message: "Control cleared — click Start tracer to resume.",
    });
  }

  writeControl(action);

  // Give cooperative pause a moment; stop also kills if still alive.
  if (action === "stop") {
    await new Promise((r) => setTimeout(r, 1500));
    const { killed, pid } = killLockedTracer();
    const db = getDb();
    try {
      const state = getTraceState(db);
      updateTraceState(db, {
        last_traced_txid: state?.last_traced_txid ?? null,
        last_traced_depth: state?.last_traced_depth ?? 0,
        total_utxos_found: state?.total_utxos_found ?? 0,
        fee_sats_retraced: state?.fee_sats_retraced ?? "0",
        status: "paused",
      });
    } finally {
      db.close();
    }
    clearControl();
    return NextResponse.json({
      ok: true,
      message: killed
        ? `Stopped tracer (pid ${pid}). Queue preserved — Start tracer to resume.`
        : "Stop requested. Queue preserved — Start tracer to resume.",
      killed,
      pid,
    });
  }

  // pause
  const lock = readLock();
  return NextResponse.json({
    ok: true,
    message:
      "Pause requested — tracer will stop after the current queue item. Queue is preserved.",
    pid: lock?.pid ?? null,
  });
}
