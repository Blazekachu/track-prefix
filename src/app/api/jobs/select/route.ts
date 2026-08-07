import { NextResponse } from "next/server";
import { setActiveJob, summarizeJob, getJobById } from "@/core/job-library";
import { loadConfig } from "@/core/job-config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const existing = getJobById(body.id);
  if (!existing) {
    return NextResponse.json({ error: "Unknown job id." }, { status: 404 });
  }

  try {
    const entry = setActiveJob(body.id);
    const cfg = loadConfig();
    return NextResponse.json({
      ok: true,
      job: summarizeJob(entry, cfg?.activeJobId ?? entry.id),
      config: cfg,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }
}
