import { NextResponse } from "next/server";
import {
  getJobById,
  jobStoragePresent,
  type JobEntry,
} from "@/core/job-library";
import { exportSnapshotForJob } from "@/core/snapshot-export";

export const dynamic = "force-dynamic";

type Body = {
  jobId?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.jobId?.trim()) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const entry: JobEntry | null = getJobById(body.jobId.trim());
  if (!entry) {
    return NextResponse.json({ error: "Unknown jobId." }, { status: 404 });
  }
  if (!jobStoragePresent(entry)) {
    return NextResponse.json(
      {
        error:
          "Selected job folder is missing. Recreate it first (open job or run New track).",
      },
      { status: 409 }
    );
  }

  try {
    const result = await exportSnapshotForJob(entry);
    return NextResponse.json({
      ok: true,
      job: {
        id: entry.id,
        prefix: entry.prefix,
        seriesId: entry.seriesId,
      },
      outputPath: result.outPath,
      format: "json",
      summary: {
        series: result.seriesCount,
        utxos: result.utxoCount,
        inscriptions: result.inscriptionCount,
        snapshotBlockHeight: result.blockHeight,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
