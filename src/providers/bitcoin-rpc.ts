/**
 * Minimal Bitcoin Core JSON-RPC client.
 * Expects a full RPC URL (e.g. http://127.0.0.1:8332) plus user/password.
 */

export type BitcoinRpcConfig = {
  rpcUrl: string;
  rpcUser: string;
  rpcPassword: string;
  timeoutMs?: number;
};

type JsonRpcResponse<T> = {
  result?: T;
  error?: { code: number; message: string } | null;
  id?: number | string;
};

export class BitcoinRpcClient {
  private url: string;
  private authHeader: string;
  private timeoutMs: number;
  private id = 0;

  constructor(cfg: BitcoinRpcConfig) {
    const base = cfg.rpcUrl.trim().replace(/\/+$/, "");
    if (!base) throw new Error("rpcUrl is required");
    if (!cfg.rpcUser?.trim()) throw new Error("rpcUser is required");
    this.url = base;
    this.authHeader =
      "Basic " +
      Buffer.from(`${cfg.rpcUser}:${cfg.rpcPassword ?? ""}`).toString("base64");
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.authHeader,
          "User-Agent": "track-prefix/0.1",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.id,
          method,
          params,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(
          `Bitcoin RPC HTTP ${res.status} on ${method}: ${res.statusText}`
        );
      }
      const body = (await res.json()) as JsonRpcResponse<T>;
      if (body.error) {
        throw new Error(
          `Bitcoin RPC ${method} error ${body.error.code}: ${body.error.message}`
        );
      }
      return body.result as T;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Bitcoin RPC ${method} timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  getblockchaininfo(): Promise<{
    chain: string;
    blocks: number;
    headers: number;
  }> {
    return this.call("getblockchaininfo");
  }

  getblockcount(): Promise<number> {
    return this.call("getblockcount");
  }

  getblockhash(height: number): Promise<string> {
    return this.call("getblockhash", [height]);
  }

  /** verbosity 1 = txids; 2 = full decoded txs */
  getblock(
    hash: string,
    verbosity: 1 | 2 = 1
  ): Promise<{
    hash: string;
    height: number;
    time: number;
    nTx: number;
    tx: Array<
      | string
      | {
          txid: string;
          vin: Array<{
            coinbase?: string;
            txid?: string;
            vout?: number;
            prevout?: { value?: number };
          }>;
          vout: Array<{
            value: number;
            n: number;
            scriptPubKey?: { address?: string; addresses?: string[] };
          }>;
          fee?: number;
        }
    >;
  }> {
    return this.call("getblock", [hash, verbosity]);
  }

  getrawtransaction(
    txid: string,
    verbose = true
  ): Promise<{
    txid: string;
    vin: Array<{
      coinbase?: string;
      txid?: string;
      vout?: number;
    }>;
    vout: Array<{
      value: number;
      n: number;
      scriptPubKey?: { address?: string; addresses?: string[]; type?: string };
    }>;
    blockhash?: string;
    confirmations?: number;
    blocktime?: number;
    time?: number;
  }> {
    return this.call("getrawtransaction", [txid, verbose]);
  }

  gettxout(
    txid: string,
    vout: number
  ): Promise<{ value: number } | null> {
    return this.call("gettxout", [txid, vout, true]);
  }

  /** Bitcoin Core 24+ — requires txindex. */
  gettxspendingprevout(
    outputs: Array<{ txid: string; vout: number }>
  ): Promise<Array<{ txid: string; vout: number; spendingtxid?: string }>> {
    return this.call("gettxspendingprevout", [outputs]);
  }

  getblockheader(hash: string): Promise<{ height: number; time: number }> {
    return this.call("getblockheader", [hash, true]);
  }
}

export function rpcConfigFromCredentials(creds: {
  rpcUrl?: string;
  rpcUser?: string;
  rpcPassword?: string;
}): BitcoinRpcConfig {
  const rpcUrl = creds.rpcUrl?.trim();
  const rpcUser = creds.rpcUser?.trim();
  if (!rpcUrl) throw new Error("btc_node/btc_ord requires modeCredentials.rpcUrl");
  if (!rpcUser) throw new Error("btc_node/btc_ord requires modeCredentials.rpcUser");
  return {
    rpcUrl,
    rpcUser,
    rpcPassword: creds.rpcPassword ?? "",
  };
}
