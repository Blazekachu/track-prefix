import { getDb } from "../src/db/index";
import { getTraceAccounting, getTraceState, getUtxoStats, getQueueSize } from "../src/db/queries";

const db = getDb();

const state = getTraceState(db);
const stats = getUtxoStats(db, 1);
const queueSize = getQueueSize(db);
const accounting = getTraceAccounting(db, 1);

const STATUS_SYMBOLS: Record<string, string> = {
  idle: "[ ] IDLE",
  tracing: "[>] TRACING",
  refreshing: "[~] REFRESHING",
  paused: "[||] PAUSED",
  complete: "[x] COMPLETE",
  error: "[!] ERROR",
};

console.log("=== TRACK-PREFIX STATUS ===\n");

if (!state) {
  console.log("Indexer: Never run");
  console.log("\nRun:  npm run index          (start tracing)");
} else {
  const symbol = STATUS_SYMBOLS[state.status] ?? `[?] ${state.status}`;
  console.log(`Status:          ${symbol}`);
  console.log(`Last run:        ${state.last_run} UTC`);
  console.log(`Queue pending:   ${queueSize} items`);
  console.log(`UTXOs found:     ${state.total_utxos_found}`);
  console.log(`Fee sats retraced: ${BigInt(state.fee_sats_retraced ?? "0").toLocaleString("en-US")}`);

  if (state.status === "paused") {
    console.log(`\n  Paused — run 'npm run index' to resume from where you left off.`);
  } else if (state.status === "complete") {
    console.log(`\n  Complete — run 'npm run index -- refresh' to check for movements.`);
  }
}

console.log("");
console.log("--- Series 1 DB Stats ---");
console.log(`Live UTXOs:      ${stats.utxo_count}`);
console.log(`Unique wallets:  ${stats.wallet_count}`);
console.log(`Total sats:      ${stats.total_sats.toLocaleString("en-US")}`);
console.log(`Inscribed sats:  ${stats.inscribed_count}`);
console.log(`Queued sats:     ${accounting.queued_sats.toLocaleString("en-US")}`);
console.log(`Accounted sats:  ${accounting.accounted_sats.toLocaleString("en-US")} / ${accounting.target_sats.toLocaleString("en-US")}`);
console.log(`Duplicate sats:  ${accounting.duplicate_sats.toLocaleString("en-US")}`);
console.log(`Gap sats:        ${accounting.gap_sats.toLocaleString("en-US")}`);

console.log("");
console.log("--- Commands ---");
console.log("npm run index            Start/resume tracing");
console.log("npm run index -- refresh Check live UTXOs for movements");
console.log("npm run status           This status view");

db.close();
