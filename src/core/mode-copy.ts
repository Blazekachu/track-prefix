import type { DataMode } from "./job-config";

export type ModeCapability = {
  label: string;
  summary: string;
  utxoTrace: string;
  inscriptions: string;
  requirements: string;
  /** Can run inscription scan against a sat metadata source. */
  canInscriptionScan: boolean;
};

export const MODE_CAPABILITIES: Record<DataMode, ModeCapability> = {
  public_api: {
    label: "Public API (no node)",
    summary:
      "UTXO FIFO tracing via public Esplora. Inscription checks use ordinals.com when you run a scan.",
    utxoTrace:
      "Yes — position tracking uses public block explorers (rate limits / ISP bans possible).",
    inscriptions:
      "Optional: after UTXO complete, scan the first sat of each live UTXO (common inscription seat). Every-sat scan needs BTC+ord.",
    requirements: "Network access only. No bitcoind or ord required.",
    canInscriptionScan: true,
  },
  paid_api: {
    label: "Paid / subscribed API",
    summary:
      "Same as public API, but through your Esplora base URL (higher limits).",
    utxoTrace: "Yes — via your paid Esplora endpoint.",
    inscriptions:
      "Optional: first-sat-per-UTXO scan after complete. Every-sat needs BTC+ord.",
    requirements: "API base URL (+ optional key).",
    canInscriptionScan: true,
  },
  btc_node: {
    label: "BTC node (RPC)",
    summary:
      "UTXO FIFO tracing via your bitcoind only. Ord is not required for sat location — offsets are carried through FIFO.",
    utxoTrace:
      "Yes — full position tracking with txindex (Core 24+ recommended for Refresh spends).",
    inscriptions:
      "Not available — RPC has no inscription index. Use BTC node + ord (or public API scan) for inscription tracking.",
    requirements: "Mainnet bitcoind with txindex=1. DB still stored under data/jobs/.",
    canInscriptionScan: false,
  },
  btc_ord: {
    label: "BTC node + ord",
    summary:
      "UTXO FIFO via bitcoind; inscription metadata via your local ord after position track completes.",
    utxoTrace: "Yes — same bitcoind FIFO walk as BTC node alone.",
    inscriptions:
      "Yes — after UTXO complete: first-sat scan (default) or Scan every sat via local ord.",
    requirements:
      "Mainnet bitcoind (txindex=1) + ord HTTP with sat index. DB still under data/jobs/.",
    canInscriptionScan: true,
  },
};

export function modeCanInscriptionScan(mode: DataMode): boolean {
  return MODE_CAPABILITIES[mode].canInscriptionScan;
}
