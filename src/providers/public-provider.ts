import type { OrdProvider, SatInfo, Transaction, BlockInfo } from "./types";
import { esploraGet } from "./esplora-client";

const ORDINALS_BASE = "https://ordinals.com";

const FETCH_TIMEOUT = 15000; // 15s per request (ordinals.com)
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "bhang-tracker/0.1",
};

async function fetchWithTimeout(url: string, opts?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRetry<T>(
  url: string,
  parse: "json" | "text",
  headers?: Record<string, string>
): Promise<T> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers: { ...DEFAULT_HEADERS, ...headers } });
      if (res.status === 429 || res.status === 406) {
        // Rate limited or rejected — wait longer
        const wait = 5000 * (attempt + 1);
        console.warn(`[provider] HTTP ${res.status} on ${url}, waiting ${wait / 1000}s...`);
        await sleep(wait);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} fetching ${url}: ${res.statusText}`);
      }
      if (parse === "text") return (await res.text()) as T;
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (lastErr.name === "AbortError") {
        console.warn(`[provider] Timeout on ${url} (attempt ${attempt + 1}/${MAX_RETRIES})`);
      } else {
        console.warn(`[provider] Error on ${url} (attempt ${attempt + 1}/${MAX_RETRIES}): ${lastErr.message}`);
      }
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAY * (attempt + 1));
      }
    }
  }
  throw lastErr || new Error(`Failed to fetch ${url}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PublicOrdProvider implements OrdProvider {
  private delayMs: number;
  private esploraBases?: string[];
  private blockHashCache = new Map<string, string>();

  constructor(delayMs = 100, esploraBases?: string[]) {
    this.delayMs = delayMs;
    this.esploraBases = esploraBases;
  }

  // All Esplora reads flow through the shared client, which handles per-provider
  // cooldowns (honoring 429/Retry-After), the global rate limiter, /outspends
  // de-dupe, and the never-miss guarantee: it THROWS when every provider is
  // unavailable rather than fabricating a result, so the tracer's catch leaves
  // the UTXO live for the next run. See esplora-client.ts.
  private fetchEsplora<T>(path: string, parse: "json" | "text"): Promise<T> {
    return esploraGet<T>(path, {
      parse,
      delayMs: this.delayMs,
      ...(this.esploraBases?.length ? { bases: this.esploraBases } : {}),
    });
  }

  private async getBlockHash(height: number): Promise<string> {
    const cacheKey = `height:${height}`;
    if (!this.blockHashCache.has(cacheKey)) {
      const hash = await this.fetchEsplora<string>(
        `/block-height/${height}`,
        "text"
      );
      this.blockHashCache.set(cacheKey, hash);
    }
    return this.blockHashCache.get(cacheKey)!;
  }

  async getSat(satNumber: string): Promise<SatInfo> {
    const data = await fetchRetry<{
      name: string;
      block: number;
      offset: number;
      rarity: string;
      inscription_ids?: string[];
    }>(`${ORDINALS_BASE}/sat/${satNumber}`, "json", { Accept: "application/json" });

    return {
      number: satNumber,
      name: data.name || "",
      block: data.block || 0,
      offset: data.offset || 0,
      rarity: data.rarity || "common",
      inscriptions: data.inscription_ids || [],
    };
  }

  async getTransaction(txid: string): Promise<Transaction> {
    const tx = await this.fetchEsplora<{
      txid: string;
      vin: Array<{ txid: string; vout: number; prevout: { value: number } }>;
      vout: Array<{ value: number; scriptpubkey_address?: string }>;
      status: { block_height: number; block_time?: number };
      fee: number;
    }>(`/tx/${txid}`, "json");

    // Fetch outspends in one call (not per-output)
    const spends = await this.fetchEsplora<Array<{ spent: boolean; txid?: string }>>(
      `/tx/${txid}/outspends`,
      "json"
    );

    const outputs = tx.vout.map((out, i) => ({
      value: out.value,
      address: out.scriptpubkey_address || "unknown",
      spent: spends[i]?.spent ?? false,
      spending_txid: spends[i]?.txid,
    }));

    return {
      txid: tx.txid,
      inputs: tx.vin.map((vin) => ({
        txid: vin.txid,
        vout: vin.vout,
        value: vin.prevout?.value || 0,
      })),
      outputs,
      block_height: tx.status.block_height,
      block_time: tx.status.block_time,
      fee: tx.fee,
    };
  }

  async getBlock(height: number): Promise<BlockInfo> {
    const hash = await this.getBlockHash(height);

    const block = await this.fetchEsplora<{
      id: string;
      height: number;
      timestamp: number;
      tx_count: number;
    }>(`/block/${hash}`, "json");

    const txids = await this.fetchEsplora<string[]>(
      `/block/${hash}/txids`,
      "json"
    );

    return {
      height: block.height,
      hash: block.id,
      timestamp: block.timestamp,
      tx_count: block.tx_count,
      coinbase_txid: txids[0],
    };
  }

  async getBlockTxids(height: number): Promise<string[]> {
    const hash = await this.getBlockHash(height);
    return this.fetchEsplora<string[]>(`/block/${hash}/txids`, "json");
  }

  async getBlockTxsPage(height: number, startIndex: number): Promise<Array<{ txid: string; fee: number }>> {
    const hash = await this.getBlockHash(height);
    const txs = await this.fetchEsplora<Array<{ txid: string; fee: number }>>(
      `/block/${hash}/txs/${startIndex}`,
      "json"
    );
    return txs.map((tx) => ({ txid: tx.txid, fee: tx.fee }));
  }

  async getOutputSpend(
    txid: string,
    vout: number
  ): Promise<{ spent: boolean; spending_txid?: string }> {
    const spends = await this.fetchEsplora<Array<{ spent: boolean; txid?: string }>>(
      `/tx/${txid}/outspends`,
      "json"
    );
    if (spends[vout]) {
      return {
        spent: spends[vout].spent,
        spending_txid: spends[vout].txid,
      };
    }
    throw new Error(`Output ${txid}:${vout} not found in outspends response`);
  }
}
