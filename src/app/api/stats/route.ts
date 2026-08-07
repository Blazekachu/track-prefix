import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";
import { getDb } from "@/db/index";
import { getUtxoStats, getInscriptionsBySeries } from "@/db/queries";

export async function GET(request: NextRequest) {
  const seriesId = parseInt(
    request.nextUrl.searchParams.get("series") || "1",
    10
  );

  const db = getDb();
  try {
    const stats = getUtxoStats(db, seriesId);
    const inscriptions = getInscriptionsBySeries(db, seriesId);
    return NextResponse.json({ ...stats, inscriptions });
  } finally {
    db.close();
  }
}
