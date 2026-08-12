import { NextResponse } from "next/server";
import { fetchPublicChainTip } from "@/core/public-tip";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await fetchPublicChainTip();
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      height: result.height,
      source: result.source,
    });
  }
  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      failures: result.failures,
    },
    { status: 503 }
  );
}
