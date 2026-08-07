import { NextResponse } from "next/server";
import {
  defaultModeAvailability,
  loadConfig,
  saveConfig,
  type DataMode,
  type TrackPrefixConfig,
} from "@/core/job-config";
import { createJob, healActiveJobStorage, listJobSummaries } from "@/core/job-library";
import { validatePrefix } from "@/core/prefix";
import { buildSeriesRanges } from "@/core/series-ranges";
import { seriesIsMined } from "@/core/forecast";

export const dynamic = "force-dynamic";

export async function GET() {
  // Ensures legacy layout migration + heals missing job folders before boot.
  const healed = healActiveJobStorage();
  const jobs = listJobSummaries();
  const cfg = loadConfig();
  return NextResponse.json({
    config: cfg,
    activeJobId: cfg?.activeJobId ?? null,
    jobs,
    storageHealed: healed.healed,
    modeAvailability: {
      ...defaultModeAvailability(),
      ...(cfg?.modeAvailability ?? {}),
    },
  });
}

export async function POST(req: Request) {
  let body: TrackPrefixConfig;
  try {
    body = (await req.json()) as TrackPrefixConfig;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.version !== 1) {
    return NextResponse.json({ error: "Unsupported config version." }, { status: 400 });
  }

  const availability = {
    ...defaultModeAvailability(),
    ...(body.modeAvailability ?? {}),
  };
  if (availability[body.mode] !== "ready") {
    return NextResponse.json(
      { error: `Mode ${body.mode} is not available yet.` },
      { status: 400 }
    );
  }

  if (!body.job) {
    return NextResponse.json({ error: "job is required." }, { status: 400 });
  }

  const validated = validatePrefix(body.job.prefix);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const ranges = buildSeriesRanges(validated.prefix);
  const series = ranges.find((s) => s.id === body.job!.seriesId);
  if (!series) {
    return NextResponse.json({ error: "Unknown series id for prefix." }, { status: 400 });
  }

  const tip = BigInt(body.job.tipHeightAtStart);
  if (!seriesIsMined(series, tip)) {
    return NextResponse.json(
      { error: "Only mined series can be tracked." },
      { status: 400 }
    );
  }

  const cfg: TrackPrefixConfig = {
    version: 1,
    wizardComplete: true,
    mode: body.mode as DataMode,
    modeCredentials: body.modeCredentials ?? {},
    modeAvailability: availability,
    job: {
      prefix: validated.prefix,
      seriesId: series.id,
      nameLength: series.nameLength,
      satStart: series.satStart.toString(),
      satEnd: series.satEnd.toString(),
      satCount: series.satCount.toString(),
      tipHeightAtStart: body.job.tipHeightAtStart,
    },
  };

  const entry = createJob({ job: cfg.job!, mode: cfg.mode });
  cfg.activeJobId = entry.id;

  saveConfig(cfg);
  return NextResponse.json({ ok: true, config: cfg, job: entry });
}
