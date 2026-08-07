import type { OrdProvider, SatInfo } from "./types";
import { BitcoinRpcProvider } from "./bitcoin-rpc-provider";
import type { BitcoinRpcConfig } from "./bitcoin-rpc";

/**
 * bitcoind RPC for chain/UTXO walk + local ord HTTP for sat/inscription metadata.
 */
export class LocalOrdProvider extends BitcoinRpcProvider implements OrdProvider {
  private ordBase: string;

  constructor(rpc: BitcoinRpcConfig, ordUrl: string, delayMs = 0) {
    super(rpc, delayMs);
    const base = ordUrl.trim().replace(/\/+$/, "");
    if (!base) throw new Error("btc_ord requires modeCredentials.ordUrl");
    this.ordBase = base;
  }

  async getSat(satNumber: string): Promise<SatInfo> {
    const url = `${this.ordBase}/sat/${satNumber}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "track-prefix/0.1",
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        // Fall back to pure math if ord cannot answer
        return super.getSat(satNumber);
      }
      const data = (await res.json()) as {
        name?: string;
        block?: number;
        offset?: number;
        rarity?: string;
        inscriptions?: string[];
        inscription_ids?: string[];
      };
      return {
        number: satNumber,
        name: data.name || "",
        block: data.block || 0,
        offset: data.offset || 0,
        rarity: data.rarity || "common",
        inscriptions: data.inscription_ids || data.inscriptions || [],
      };
    } catch {
      return super.getSat(satNumber);
    } finally {
      clearTimeout(timer);
    }
  }

  async checkOrdReachable(): Promise<{ ok: boolean; detail: string }> {
    const url = `${this.ordBase}/status`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "track-prefix/0.1" },
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) return { ok: true, detail: `ord status HTTP ${res.status}` };
      return { ok: false, detail: `ord status HTTP ${res.status}` };
    } catch (err) {
      return {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
