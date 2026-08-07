/**
 * Known wallet labels — Bitcoin address → operator.
 *
 * This code map is the single source of truth (version-controlled, survives
 * DB resets). `getDb()` syncs it into the `wallet_labels` DB table on every
 * open, and `export-snapshot.ts` attaches the label to each UTXO in the
 * snapshot — so every scheduled push reflects this list automatically.
 *
 * Labels are keyed by ADDRESS, not outpoint: these wallets reuse one address,
 * so when tracked sats move within the same wallet the label still applies.
 */
export type WalletKind = "exchange" | "hot-wallet" | "mining-pool" | "unknown";

export interface WalletLabel {
  label: string;
  kind: WalletKind;
}

export const WALLET_LABELS: Record<string, WalletLabel> = {
  // Chain A — holds the 41,568-sat BHANG chunk. ~20,000 BTC P2WSH wallet doing
  // batched withdrawals + self-consolidation. Labelled "Coinbase" by ClankApp.
  // Identified 2026-05-20.
  "bc1qx2x5cqhymfcnjtg902ky6u5t5htmt7fvqztdsm028hkrvxcl4t2sjtpd9l": {
    label: "Coinbase",
    kind: "exchange",
  },
  // Chain B — holds the 79,000-sat BHANG chunk. P2WPKH, 76,937+ txns, a
  // high-frequency service hot wallet. Operator not yet identified.
  // Seen 2026-05-20.
  "bc1qgw64kdhf67803240csrzg480atmkaxp5snq0cm": {
    label: "Unrecognised hot wallet",
    kind: "hot-wallet",
  },
  // Binance Pool — historical coinbase payout address. 8 UTXOs / 106,075 BHANG
  // sats arrived here as transaction fees across blocks 635485–679668
  // (2020–2021) and have been unspent since. Identified via coinbase scriptSig
  // tag "binance.com". Identified 2026-05-22.
  "bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4": {
    label: "Binance Pool",
    kind: "mining-pool",
  },

  // ─── Major exchange wallets ───
  // Confirmed exchange-owned addresses. When a tracked BHANG sat lands here
  // it is absorbed into the exchange omnibus — exchanges do not credit
  // depositors for rare/special sats.

  // Binance Cold Wallet — Binance's #2 cold storage (active since 2018-11,
  // holds ~159,868 BTC). Received 58,512 BHANG sats via consolidation TX
  // 2ef934c8…488 at block 951243 (40,000 originally from bc1qgcgc5f… +
  // 18,512 originally from bc1qm34lsc65… via the hot wallet). Confirmed by
  // Spark.money, Arkham, and the cryptonews.net Bitcoin rich list.
  // Identified 2026-05-28.
  "3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6": {
    label: "Binance Cold Wallet",
    kind: "exchange",
  },
  // Binance Hot Wallet — Binance's primary BTC hot wallet (603K+ txs, 36.97M
  // BTC lifetime throughput). Sweeps deposits into 3M219KR5… Confirmed by
  // Spark.money, Arkham, and WalletExplorer cluster [4f2bef8f27]. Identified
  // 2026-05-28.
  "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h": {
    label: "Binance Hot Wallet",
    kind: "hot-wallet",
  },
  // Binance Cold Wallet (second confirmed Binance cold-storage address) —
  // 248,597 BTC (P2SH), the largest single Bitcoin address by balance as of
  // 2026-05. 19 BHANG sat ranges across 14 outpoints (2,005,842 sats).
  // Confirmed by Spark.money "Binance (Cold Wallet)", bitinfocharts
  // [wallet: Binance-coldwallet], and WalletExplorer cluster [011cf39664].
  // Identified 2026-05-28.
  "34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo": {
    label: "Binance Cold Wallet",
    kind: "exchange",
  },
  // Robinhood Cold Wallet — 140,062 BTC (P2WPKH), custody for the US retail
  // brokerage's commission-free crypto trading. 6 BHANG sat ranges across 5
  // outpoints (2,260,076 sats). Confirmed by Spark.money "Robinhood (Cold
  // Wallet)", bitinfocharts [wallet: Robinhood-coldwallet], tokenview
  // "Robinhood", and WalletExplorer cluster [127968a9ee]. Identified
  // 2026-05-28.
  "bc1ql49ydapnjafl5t2cp9zqpjwe6pdgmxy98859v2": {
    label: "Robinhood Cold Wallet",
    kind: "exchange",
  },

  // ─── Major mining-pool coinbase payout addresses ───
  // Pre-loaded so any BHANG sat paid as a fee into one of these pools' blocks
  // auto-labels. Verified on-chain from coinbase outputs of the ~600 blocks
  // ending at height 950529 (scanned 2026-05-22). No BHANG sats sit at these
  // today — purely future-proofing. OCEAN is intentionally excluded: it pays
  // individual miners directly in the coinbase, so its outputs are miners, not
  // a pool wallet.
  "bc1qwzrryqr3ja8w7hnja2spmkgfdcgvqwp5swz4af4ngsjecfz0w0pqud7k38": { label: "Foundry USA", kind: "mining-pool" },
  "37jKPSmbEGwgfacCr2nayn1wTaqMAbA94Z": { label: "AntPool", kind: "mining-pool" },
  "39C7fxSzEACPjM78Z7xdPxhf7mKxJwvfMJ": { label: "AntPool", kind: "mining-pool" },
  "1PuJjnF476W3zXfVYmJfGnouzFDAXakkL4": { label: "ViaBTC", kind: "mining-pool" },
  "1K6KoYC69NnafWJ7YgtrpwJxBLiijWqwa6": { label: "F2Pool", kind: "mining-pool" },
  "1AfCc4F9c4VTYSE31PUe2kUEKs6ZxiDjxm": { label: "F2Pool", kind: "mining-pool" },
  "1BM1sAcrfV6d4zPKytzziu4McLQDsFC2Qc": { label: "SpiderPool", kind: "mining-pool" },
  "32i1m6gNcSHwiPX9nfTNXVjme9j5DU8y5g": { label: "MARA Pool", kind: "mining-pool" },
  "3Eif1JfqeMERRsQHtvGEacNN9hhuvnsfe9": { label: "SECPOOL", kind: "mining-pool" },
  "3Awm3FNpmwrbvAFVThRUFqgpbVuqWisni9": { label: "SECPOOL", kind: "mining-pool" },
  "3K9KZZPB8NRwZVP5wNKX4VYhnswrJxpgZ4": { label: "Luxor", kind: "mining-pool" },
  "32BfKjhByDSxx3BM5vUkQ3NQq9csZR6nt6": { label: "Luxor", kind: "mining-pool" },
  "35BpUGMm4Cod9dVWwdTJK1A4RDsCE3zTVC": { label: "Binance Pool", kind: "mining-pool" },
  "3G7jcEELKh38L6kaSV8K35pTqsh5bgZW2D": { label: "Binance Pool", kind: "mining-pool" },
  "bc1qey5lp33mkzsk93pmg3d89ml75xchgv4lx50w7j": { label: "SBI Crypto", kind: "mining-pool" },
  "34XC8GbijKCCvppNvhw4Ra8QZdWsg8tC11": { label: "Braiins Pool", kind: "mining-pool" },
  "36MbhpVScX6QV8hWwZ19xXLHXJfGoj8h1g": { label: "ULTIMUSPOOL", kind: "mining-pool" },
  "3C9sAKXrBVpJVe3b738yik4LPHpPmceBgd": { label: "ULTIMUSPOOL", kind: "mining-pool" },
};

export function getWalletLabel(address: string): WalletLabel | undefined {
  return WALLET_LABELS[address];
}
