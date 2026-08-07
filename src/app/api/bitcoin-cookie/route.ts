import { NextResponse } from "next/server";
import {
  defaultBitcoinCookiePaths,
  readBitcoinCookie,
} from "@/core/bitcoin-cookie";

export const dynamic = "force-dynamic";

type Body = {
  cookiePath?: string;
};

/**
 * Explicit opt-in: read Bitcoin Core .cookie only when the wizard requests it.
 * Never called on page load.
 */
export async function POST(req: Request) {
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  try {
    const auth = readBitcoinCookie(body.cookiePath);
    return NextResponse.json({
      ok: true,
      rpcUser: auth.rpcUser,
      rpcPassword: auth.rpcPassword,
      cookiePath: auth.cookiePath,
      defaultPaths: defaultBitcoinCookiePaths(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        defaultPaths: defaultBitcoinCookiePaths(),
      },
      { status: 404 }
    );
  }
}
