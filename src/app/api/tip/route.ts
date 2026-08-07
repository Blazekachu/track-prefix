import { NextResponse } from "next/server";
import { esploraGet } from "@/providers/esplora-client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const text = await esploraGet<string>("/blocks/tip/height", {
      parse: "text",
      timeoutMs: 8_000,
    });
    const height = parseInt(text, 10);
    if (!Number.isFinite(height) || height <= 0) {
      return NextResponse.json(
        { error: "Invalid tip height from providers." },
        { status: 503 }
      );
    }
    return NextResponse.json({ height });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not fetch tip height from any provider.",
      },
      { status: 503 }
    );
  }
}
