import { NextResponse } from "next/server";
import {
  defaultModeAvailability,
  loadConfig,
  saveConfig,
  type DataMode,
  type TrackPrefixConfig,
} from "@/core/job-config";
import {
  createJob,
  listJobSummaries,
  assertCanCreateNewTrack,
} from "@/core/job-library";
import { validatePrefix } from "@/core/prefix";
import { buildSeriesRanges } from "@/core/series-ranges";
import { seriesIsMined } from "@/core/forecast";
import { validateModeCredentials } from "@/providers/mode";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();
  return NextResponse.json({
    activeJobId: cfg?.activeJobId ?? null,
    jobs: listJobSummaries(),
  });
}

type CreateJobBody = {
  mode: DataMode;
  modeCredentials?: TrackPrefixConfig["modeCredentials"];
  job: {
    prefix: string;
    seriesId: number;
    nameLength: number;
    satStart: string;
    satEnd: string;
    satCount: string;
    tipHeightAtStart: number;
  };
};

export async function POST(req: Request) {
  let body: CreateJobBody;
  try {
    body = (await req.json()) as CreateJobBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const availability = {
    ...defaultModeAvailability(),
    ...(loadConfig()?.modeAvailability ?? {}),
  };
  if (availability[body.mode] !== "ready") {
    return NextResponse.json(
      { error: `Mode ${body.mode} is not available yet.` },
      { status: 400 }
    );
  }

  try {
    assertCanCreateNewTrack(body.mode);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 409 }
    );
  }

  try {
    validateModeCredentials({
      mode: body.mode,
      modeCredentials: body.modeCredentials ?? {},
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
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
  const series = ranges.find((s) => s.id === body.job.seriesId);
  if (!series) {
    return NextResponse.json(
      { error: "Unknown series id for prefix." },
      { status: 400 }
    );
  }

  const tip = BigInt(body.job.tipHeightAtStart);
  if (!seriesIsMined(series, tip)) {
    return NextResponse.json(
      { error: "Only mined series can be tracked." },
      { status: 400 }
    );
  }

  const trackJob = {
    prefix: validated.prefix,
    seriesId: series.id,
    nameLength: series.nameLength,
    satStart: series.satStart.toString(),
    satEnd: series.satEnd.toString(),
    satCount: series.satCount.toString(),
    tipHeightAtStart: body.job.tipHeightAtStart,
  };

  const entry = createJob({ job: trackJob, mode: body.mode });

  const cfg: TrackPrefixConfig = {
    version: 1,
    wizardComplete: true,
    mode: body.mode,
    modeCredentials: body.modeCredentials ?? {},
    modeAvailability: availability,
    activeJobId: entry.id,
    job: trackJob,
  };
  saveConfig(cfg);

  return NextResponse.json({
    ok: true,
    job: entry,
    config: cfg,
  });
}
