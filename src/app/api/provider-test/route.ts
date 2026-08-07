import { NextResponse } from "next/server";
import type { DataMode } from "@/core/job-config";
import type { ModeCredentials } from "@/providers/mode";
import { validateModeCredentials } from "@/providers/mode";
import { probeProviderConnection } from "@/providers/create-provider";

export const dynamic = "force-dynamic";

type Body = {
  mode?: DataMode;
  modeCredentials?: ModeCredentials;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.mode) {
    return NextResponse.json({ error: "mode is required." }, { status: 400 });
  }

  const modeCredentials = body.modeCredentials ?? {};
  try {
    validateModeCredentials({ mode: body.mode, modeCredentials });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  const result = await probeProviderConnection({
    mode: body.mode,
    modeCredentials,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 503 });
  }
  return NextResponse.json(result);
}
