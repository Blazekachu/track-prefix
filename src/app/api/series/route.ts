import { NextResponse } from "next/server";
import { getDb } from "@/db/index";
import { getSeries } from "@/db/queries";

export async function GET() {
  const db = getDb();
  try {
    const series = getSeries(db);
    return NextResponse.json(series);
  } finally {
    db.close();
  }
}
