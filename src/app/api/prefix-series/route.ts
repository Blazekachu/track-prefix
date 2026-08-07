import { NextResponse } from "next/server";
import { loadConfig } from "@/core/job-config";
import { buildSeriesRanges } from "@/core/series-ranges";
import { getMiningProgress } from "@/core/mining-progress";
import {
  findJobByPrefixSeries,
  summarizeJob,
} from "@/core/job-library";
import { esploraGet } from "@/providers/esplora-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();
  if (!cfg?.job) {
    return NextResponse.json({ error: "No active job." }, { status: 400 });
  }

  let tipHeight: number;
  try {
    const text = await esploraGet<string>("/blocks/tip/height", {
      parse: "text",
      timeoutMs: 8_000,
    });
    tipHeight = parseInt(text, 10);
    if (!Number.isFinite(tipHeight) || tipHeight <= 0) {
      throw new Error("Invalid tip height.");
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not fetch tip height.",
      },
      { status: 503 }
    );
  }

  const prefix = cfg.job.prefix;
  const tip = BigInt(tipHeight);
  const activeJobId = cfg.activeJobId ?? null;
  const ranges = buildSeriesRanges(prefix);

  const series = ranges.map((range) => {
    const mining = getMiningProgress(range, tip);
    const jobEntry = findJobByPrefixSeries(prefix, range.id);
    const job = jobEntry ? summarizeJob(jobEntry, activeJobId) : null;

    return {
      id: range.id,
      nameLength: range.nameLength,
      satStart: range.satStart.toString(),
      satEnd: range.satEnd.toString(),
      satCount: range.satCount.toString(),
      satStartName: range.satStartName,
      satEndName: range.satEndName,
      clamped: range.clamped,
      firstBlock: mining.firstBlock,
      targetBlock: mining.targetBlock,
      mined: mining.mined,
      miningPercent: mining.miningPercent,
      blocksRemaining: mining.blocksRemaining,
      estimatedYears: mining.estimatedYears,
      trackable: mining.trackable,
      jobId: job?.id ?? null,
      isActiveJob: job?.isActive ?? false,
      traceStatus: job?.traceStatus ?? null,
      isRunning: job?.isRunning ?? false,
      queueSize: job?.queueSize ?? 0,
      lastRun: job?.lastRun ?? null,
    };
  });

  const nextUnmined = series.find((s) => !s.mined) ?? null;

  return NextResponse.json({
    prefix,
    tipHeight,
    series,
    nextUnmined,
    activeJobId,
  });
}
