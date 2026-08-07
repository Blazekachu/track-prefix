import type { TrackPrefixConfig } from "@/core/job-config";
import type { OrdProvider } from "./types";
import { PublicOrdProvider } from "./public-provider";
import { BitcoinRpcProvider } from "./bitcoin-rpc-provider";
import { LocalOrdProvider } from "./local-ord-provider";
import { resolveEsploraBases, type ModeCredentials } from "./mode";
import { rpcConfigFromCredentials } from "./bitcoin-rpc";

export type ProviderKind =
  | "public_api"
  | "paid_api"
  | "btc_node"
  | "btc_ord";

export function createProvider(
  cfg: Pick<TrackPrefixConfig, "mode" | "modeCredentials"> | null,
  delayMs = 350
): { provider: OrdProvider; kind: ProviderKind; label: string } {
  if (!cfg) {
    return {
      provider: new PublicOrdProvider(delayMs),
      kind: "public_api",
      label: "public-esplora (no config)",
    };
  }

  if (cfg.mode === "public_api" || cfg.mode === "paid_api") {
    const bases = resolveEsploraBases({
      mode: cfg.mode,
      modeCredentials: cfg.modeCredentials,
    });
    return {
      provider: new PublicOrdProvider(delayMs, bases),
      kind: cfg.mode,
      label: cfg.mode === "paid_api" ? `paid-api:${bases[0]}` : "public-esplora",
    };
  }

  if (cfg.mode === "btc_node") {
    const rpc = rpcConfigFromCredentials(cfg.modeCredentials);
    return {
      provider: new BitcoinRpcProvider(rpc, delayMs),
      kind: "btc_node",
      label: `bitcoin-rpc:${rpc.rpcUrl}`,
    };
  }

  if (cfg.mode === "btc_ord") {
    const rpc = rpcConfigFromCredentials(cfg.modeCredentials);
    const ordUrl = cfg.modeCredentials.ordUrl?.trim();
    if (!ordUrl) {
      throw new Error("btc_ord requires modeCredentials.ordUrl");
    }
    return {
      provider: new LocalOrdProvider(rpc, ordUrl, delayMs),
      kind: "btc_ord",
      label: `local-ord:${ordUrl} + rpc:${rpc.rpcUrl}`,
    };
  }

  throw new Error(`Unknown mode: ${(cfg as { mode: string }).mode}`);
}

export async function probeProviderConnection(input: {
  mode: TrackPrefixConfig["mode"];
  modeCredentials: ModeCredentials;
}): Promise<{
  ok: boolean;
  tipHeight?: number;
  chain?: string;
  ord?: { ok: boolean; detail: string };
  error?: string;
}> {
  try {
    if (input.mode === "public_api" || input.mode === "paid_api") {
      const bases = resolveEsploraBases(input);
      const { esploraGet } = await import("./esplora-client");
      const text = await esploraGet<string>("/blocks/tip/height", {
        parse: "text",
        timeoutMs: 8_000,
        bases,
      });
      const tipHeight = parseInt(text, 10);
      return { ok: Number.isFinite(tipHeight), tipHeight };
    }

    const rpc = rpcConfigFromCredentials(input.modeCredentials);
    const { BitcoinRpcClient } = await import("./bitcoin-rpc");
    const client = new BitcoinRpcClient(rpc);
    const info = await client.getblockchaininfo();

    let ord: { ok: boolean; detail: string } | undefined;
    if (input.mode === "btc_ord") {
      const ordUrl = input.modeCredentials.ordUrl?.trim();
      if (!ordUrl) {
        return { ok: false, error: "ordUrl is required for btc_ord" };
      }
      const provider = new LocalOrdProvider(rpc, ordUrl, 0);
      ord = await provider.checkOrdReachable();
      if (!ord.ok) {
        return {
          ok: false,
          tipHeight: info.blocks,
          chain: info.chain,
          ord,
          error: `ord unreachable: ${ord.detail}`,
        };
      }
    }

    return {
      ok: true,
      tipHeight: info.blocks,
      chain: info.chain,
      ord,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
