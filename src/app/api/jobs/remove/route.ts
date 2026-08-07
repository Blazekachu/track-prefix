import { NextResponse } from "next/server";
import { removeJob } from "@/core/job-library";

export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  deleteFiles?: boolean;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.id?.trim()) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  try {
    removeJob(body.id.trim(), {
      deleteFiles: body.deleteFiles !== false,
    });
    return NextResponse.json({ ok: true, removed: body.id.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 409 }
    );
  }
}
