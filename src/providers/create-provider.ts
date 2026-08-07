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
  txindex?: { synced: boolean; best_block_height?: number };
  ord?: { ok: boolean; detail: string };
  error?: string;
  failedStep?: string;
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
      if (!Number.isFinite(tipHeight)) {
        return {
          ok: false,
          failedStep: "tip",
          error: "API returned an invalid tip height.",
        };
      }
      return { ok: true, tipHeight };
    }

    const rpc = rpcConfigFromCredentials(input.modeCredentials);
    const { BitcoinRpcClient } = await import("./bitcoin-rpc");
    const client = new BitcoinRpcClient({ ...rpc, timeoutMs: 12_000 });

    let info: { chain: string; blocks: number; headers: number };
    try {
      info = await client.getblockchaininfo();
    } catch (err) {
      return {
        ok: false,
        failedStep: "rpc",
        error: err instanceof Error ? err.message : String(err),
      };
    }

    if (info.chain !== "main") {
      return {
        ok: false,
        tipHeight: info.blocks,
        chain: info.chain,
        failedStep: "chain",
        error: `Node is on "${info.chain}", not mainnet. track-prefix requires a mainnet node.`,
      };
    }

    let txindex: { synced: boolean; best_block_height?: number };
    try {
      const indexes = await client.getindexinfo();
      const tx = indexes.txindex;
      if (!tx) {
        return {
          ok: false,
          tipHeight: info.blocks,
          chain: info.chain,
          failedStep: "txindex",
          error:
            "txindex is not enabled. Set txindex=1 in bitcoin.conf, restart bitcoind, and wait for the index to sync.",
        };
      }
      txindex = {
        synced: tx.synced !== false,
        best_block_height: tx.best_block_height,
      };
      if (!txindex.synced) {
        return {
          ok: false,
          tipHeight: info.blocks,
          chain: info.chain,
          txindex,
          failedStep: "txindex",
          error: `txindex is still syncing${
            tx.best_block_height != null
              ? ` (at height ${tx.best_block_height} / tip ${info.blocks})`
              : ""
          }. Wait until it finishes before tracing.`,
        };
      }
    } catch (err) {
      return {
        ok: false,
        tipHeight: info.blocks,
        chain: info.chain,
        failedStep: "txindex",
        error:
          `Could not verify txindex (${err instanceof Error ? err.message : String(err)}). ` +
          "Bitcoin Core 0.21+ with txindex=1 is required.",
      };
    }

    let ord: { ok: boolean; detail: string } | undefined;
    if (input.mode === "btc_ord") {
      const ordUrl = input.modeCredentials.ordUrl?.trim();
      if (!ordUrl) {
        return {
          ok: false,
          tipHeight: info.blocks,
          chain: info.chain,
          txindex,
          failedStep: "ord",
          error: "ord URL is required for BTC + ORD nodes.",
        };
      }
      const provider = new LocalOrdProvider(rpc, ordUrl, 0);
      ord = await provider.checkOrdReachable();
      if (!ord.ok) {
        return {
          ok: false,
          tipHeight: info.blocks,
          chain: info.chain,
          txindex,
          ord,
          failedStep: "ord",
          error: `Cannot reach ord at ${ordUrl}: ${ord.detail}. Is ord running and is the URL/port correct?`,
        };
      }
    }

    return {
      ok: true,
      tipHeight: info.blocks,
      chain: info.chain,
      txindex,
      ord,
    };
  } catch (err) {
    return {
      ok: false,
      failedStep: "unknown",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
