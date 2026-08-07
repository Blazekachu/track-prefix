import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { getDb } from "@/db/index";
import { getUtxosBySeries } from "@/db/queries";

export async function GET(request: NextRequest) {
  const seriesId = parseInt(
    request.nextUrl.searchParams.get("series") || "1",
    10
  );

  if (seriesId < 1 || seriesId > 7) {
    return NextResponse.json({ error: "Invalid series ID" }, { status: 400 });
  }

  const db = getDb();
  try {
    const utxos = getUtxosBySeries(db, seriesId);
    return NextResponse.json(utxos);
  } finally {
    db.close();
  }
}
