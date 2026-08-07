import { NextResponse } from "next/server";
import { validatePrefix } from "@/core/prefix";
import { buildSeriesRanges } from "@/core/series-ranges";
import { seriesIsMined } from "@/core/forecast";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const prefixRaw = url.searchParams.get("prefix") || "";
  const tipRaw = url.searchParams.get("tip") || "";
  const tip = Number(tipRaw);

  const validated = validatePrefix(prefixRaw);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  if (!Number.isInteger(tip) || tip <= 0) {
    return NextResponse.json({ error: "Valid tip required." }, { status: 400 });
  }

  const series = buildSeriesRanges(validated.prefix).map((s) => ({
    id: s.id,
    nameLength: s.nameLength,
    satCount: s.satCount.toString(),
    satStart: s.satStart.toString(),
    satEnd: s.satEnd.toString(),
    mined: seriesIsMined(s, BigInt(tip)),
  }));

  return NextResponse.json({ prefix: validated.prefix, tip, series });
}
