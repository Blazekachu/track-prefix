import { NextResponse } from "next/server";
import { loadConfig } from "@/core/job-config";
import { ensureJobForSeries } from "@/core/job-library";
import { esploraGet } from "@/providers/esplora-client";

export const dynamic = "force-dynamic";

type Body = { seriesId?: number };

async function fetchTip(): Promise<number> {
  const text = await esploraGet<string>("/blocks/tip/height", {
    parse: "text",
    timeoutMs: 8_000,
  });
  const height = parseInt(text, 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error("Invalid tip height from providers.");
  }
  return height;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.seriesId == null || !Number.isInteger(body.seriesId)) {
    return NextResponse.json({ error: "seriesId is required." }, { status: 400 });
  }

  const cfg = loadConfig();
  if (!cfg?.job) {
    return NextResponse.json({ error: "No active prefix job." }, { status: 400 });
  }

  let tipHeight: number;
  try {
    tipHeight = await fetchTip();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 503 }
    );
  }

  try {
    const entry = ensureJobForSeries({
      prefix: cfg.job.prefix,
      seriesId: body.seriesId,
      tipHeight,
    });
    return NextResponse.json({ ok: true, job: entry });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes("not mined yet") ? 403 : 409;
    return NextResponse.json({ error: msg }, { status });
  }
}
