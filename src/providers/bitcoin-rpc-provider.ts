import type { OrdProvider, SatInfo, Transaction, BlockInfo } from "./types";
import { BitcoinRpcClient, type BitcoinRpcConfig } from "./bitcoin-rpc";
import { satToBlock, satToName } from "@/core/sat-math";

type BlockFeePageCache = {
  hash: string;
  height: number;
  pages: Array<{ txid: string; fee: number }>;
};

/**
 * OrdProvider backed solely by Bitcoin Core JSON-RPC (txindex required).
 * Spending txids use gettxspendingprevout (Core 24+).
 */
export class BitcoinRpcProvider implements OrdProvider {
  protected rpc: BitcoinRpcClient;
  private delayMs: number;
  private blockHashCache = new Map<number, string>();
  private feePageCache = new Map<number, BlockFeePageCache>();

  constructor(cfg: BitcoinRpcConfig, delayMs = 0) {
    this.rpc = new BitcoinRpcClient(cfg);
    this.delayMs = delayMs;
  }

  protected async pause(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
  }

  async getTipHeight(): Promise<number> {
    await this.pause();
    return this.rpc.getblockcount();
  }

  private async hashForHeight(height: number): Promise<string> {
    if (!this.blockHashCache.has(height)) {
      await this.pause();
      const hash = await this.rpc.getblockhash(height);
      this.blockHashCache.set(height, hash);
    }
    return this.blockHashCache.get(height)!;
  }

  private outputAddress(vout: {
    scriptPubKey?: { address?: string; addresses?: string[] };
  }): string {
    const spk = vout.scriptPubKey;
    if (!spk) return "unknown";
    if (spk.address) return spk.address;
    if (spk.addresses?.length) return spk.addresses[0];
    return "unknown";
  }

  /** Core reports BTC floats — convert to sats. */
  private btcToSats(value: number): number {
    return Math.round(value * 1e8);
  }

  async getSat(satNumber: string): Promise<SatInfo> {
    const sat = BigInt(satNumber);
    const block = Number(satToBlock(sat));
    return {
      number: satNumber,
      name: satToName(sat),
      block,
      offset: 0,
      rarity: "common",
      inscriptions: [],
    };
  }

  async getTransaction(txid: string): Promise<Transaction> {
    await this.pause();
    const tx = await this.rpc.getrawtransaction(txid, true);

    const inputs: Transaction["inputs"] = [];
    for (const vin of tx.vin) {
      if (vin.coinbase || !vin.txid) {
        inputs.push({ txid: "", vout: 0, value: 0 });
        continue;
      }
      await this.pause();
      const prev = await this.rpc.getrawtransaction(vin.txid, true);
      const prevOut = prev.vout[vin.vout ?? 0];
      inputs.push({
        txid: vin.txid,
        vout: vin.vout ?? 0,
        value: prevOut ? this.btcToSats(prevOut.value) : 0,
      });
    }

    const outpoints = tx.vout.map((o) => ({ txid, vout: o.n }));
    await this.pause();
    let spendMap = new Map<number, { spent: boolean; spending_txid?: string }>();
    try {
      const spends = await this.rpc.gettxspendingprevout(outpoints);
      for (const s of spends) {
        spendMap.set(s.vout, {
          spent: Boolean(s.spendingtxid),
          spending_txid: s.spendingtxid,
        });
      }
    } catch {
      // Fallback: gettxout — no spending_txid when spent
      spendMap = new Map();
      for (const o of tx.vout) {
        await this.pause();
        const utxo = await this.rpc.gettxout(txid, o.n);
        spendMap.set(o.n, { spent: utxo === null });
      }
    }

    const outputs = tx.vout.map((o) => {
      const spend = spendMap.get(o.n) ?? { spent: false };
      return {
        value: this.btcToSats(o.value),
        address: this.outputAddress(o),
        spent: spend.spent,
        spending_txid: spend.spending_txid,
      };
    });

    let block_height = 0;
    let block_time: number | undefined;
    if (tx.blockhash) {
      await this.pause();
      const header = await this.rpc.getblockheader(tx.blockhash);
      block_height = header.height;
      block_time = header.time;
    } else if (tx.blocktime) {
      block_time = tx.blocktime;
    }

    const inSum = inputs.reduce((a, i) => a + i.value, 0);
    const outSum = outputs.reduce((a, o) => a + o.value, 0);
    const fee = inSum > 0 ? Math.max(0, inSum - outSum) : 0;

    return {
      txid: tx.txid,
      inputs,
      outputs,
      block_height,
      block_time,
      fee,
    };
  }

  async getBlock(height: number): Promise<BlockInfo> {
    const hash = await this.hashForHeight(height);
    await this.pause();
    const block = await this.rpc.getblock(hash, 1);
    const txids = block.tx as string[];
    return {
      height: block.height,
      hash: block.hash,
      timestamp: block.time,
      tx_count: block.nTx,
      coinbase_txid: txids[0],
    };
  }

  async getBlockTxids(height: number): Promise<string[]> {
    const hash = await this.hashForHeight(height);
    await this.pause();
    const block = await this.rpc.getblock(hash, 1);
    return block.tx as string[];
  }

  private async loadFeePages(height: number): Promise<Array<{ txid: string; fee: number }>> {
    const cached = this.feePageCache.get(height);
    if (cached) return cached.pages;

    const hash = await this.hashForHeight(height);
    await this.pause();
    const block = await this.rpc.getblock(hash, 2);
    const pages: Array<{ txid: string; fee: number }> = [];

    for (const raw of block.tx) {
      if (typeof raw === "string") {
        pages.push({ txid: raw, fee: 0 });
        continue;
      }
      let feeSats = 0;
      if (typeof raw.fee === "number") {
        feeSats = this.btcToSats(raw.fee);
      } else if (!raw.vin.some((v) => v.coinbase)) {
        // Compute from prevouts when Core embeds them (verbosity 2 + undo data)
        let inSum = 0;
        let missing = false;
        for (const vin of raw.vin) {
          if (vin.prevout?.value != null) {
            inSum += this.btcToSats(vin.prevout.value);
          } else {
            missing = true;
            break;
          }
        }
        if (!missing) {
          const outSum = raw.vout.reduce(
            (a, o) => a + this.btcToSats(o.value),
            0
          );
          feeSats = Math.max(0, inSum - outSum);
        } else {
          // Fall back: fetch full transaction (slower but correct)
          const full = await this.getTransaction(raw.txid);
          feeSats = full.fee;
        }
      }
      pages.push({ txid: raw.txid, fee: feeSats });
    }

    this.feePageCache.set(height, { hash, height, pages });
    return pages;
  }

  async getBlockTxsPage(
    height: number,
    startIndex: number
  ): Promise<Array<{ txid: string; fee: number }>> {
    const pages = await this.loadFeePages(height);
    return pages.slice(startIndex, startIndex + 25);
  }

  async getOutputSpend(
    txid: string,
    vout: number
  ): Promise<{ spent: boolean; spending_txid?: string }> {
    await this.pause();
    try {
      const spends = await this.rpc.gettxspendingprevout([{ txid, vout }]);
      const s = spends[0];
      if (!s) throw new Error(`Output ${txid}:${vout} not found`);
      return {
        spent: Boolean(s.spendingtxid),
        spending_txid: s.spendingtxid,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("gettxspendingprevout")) {
        // Method missing or other — try gettxout
      }
      await this.pause();
      const utxo = await this.rpc.gettxout(txid, vout);
      if (utxo !== null) return { spent: false };
      throw new Error(
        `Output ${txid}:${vout} is spent but spending txid is unavailable. ` +
          `Bitcoin Core 24+ with txindex (gettxspendingprevout) is required for refresh.`
      );
    }
  }
}
