import { NextResponse } from "next/server";
import { loadConfig } from "@/core/job-config";
import { esploraGet } from "@/providers/esplora-client";
import { resolveEsploraBases } from "@/providers/mode";
import {
  BitcoinRpcClient,
  rpcConfigFromCredentials,
} from "@/providers/bitcoin-rpc";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = loadConfig();

  try {
    if (cfg?.mode === "btc_node" || cfg?.mode === "btc_ord") {
      const rpc = rpcConfigFromCredentials(cfg.modeCredentials);
      const client = new BitcoinRpcClient(rpc);
      const height = await client.getblockcount();
      if (!Number.isFinite(height) || height <= 0) {
        return NextResponse.json(
          { error: "Invalid tip height from bitcoind." },
          { status: 503 }
        );
      }
      return NextResponse.json({ height, source: "bitcoin-rpc" });
    }

    const bases =
      cfg && (cfg.mode === "public_api" || cfg.mode === "paid_api")
        ? resolveEsploraBases({
            mode: cfg.mode,
            modeCredentials: cfg.modeCredentials,
          })
        : undefined;

    const text = await esploraGet<string>("/blocks/tip/height", {
      parse: "text",
      timeoutMs: 8_000,
      ...(bases?.length ? { bases } : {}),
    });
    const height = parseInt(text, 10);
    if (!Number.isFinite(height) || height <= 0) {
      return NextResponse.json(
        { error: "Invalid tip height from providers." },
        { status: 503 }
      );
    }
    return NextResponse.json({ height, source: "esplora" });
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
