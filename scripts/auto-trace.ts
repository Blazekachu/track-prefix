import { getDb } from "../src/db/index";
import { PublicOrdProvider } from "../src/providers/public-provider";
import { CoinbaseTracer } from "../src/indexer/tracer";
import { getQueueSize, getTraceState } from "../src/db/queries";

const delayMs = parseInt(process.env.API_DELAY_MS || "500", 10);
const dbPath = process.env.DATABASE_PATH || "./bhang-tracker.db";
const MAX_CONSECUTIVE_FAILURES = 5;
const MIN_PAUSE = 10_000;      // 10s after a good run
const MAX_PAUSE = 300_000;     // 5 min max backoff
const MIN_PROGRESS = 50;       // less than this = short/failed run

let stopping = false;

process.on("SIGINT", () => {
  console.log("\n[auto-trace] Ctrl+C received — finishing current operation and exiting...");
  stopping = true;
});

console.log(`[auto-trace] BHANG auto-tracer`);
console.log(`[auto-trace] API delay: ${delayMs}ms | Max consecutive failures: ${MAX_CONSECUTIVE_FAILURES}`);
console.log(`[auto-trace] Press Ctrl+C to stop gracefully\n`);

async function run() {
  let consecutiveFailures = 0;

  while (!stopping) {
    const db = getDb(dbPath);
    const queueBefore = getQueueSize(db);

    if (queueBefore === 0) {
      const state = getTraceState(db);
      console.log(`[auto-trace] Queue empty — trace complete! ${state?.total_utxos_found ?? 0} UTXOs found.`);
      db.close();
      break;
    }

    console.log(`[auto-trace] Run #${consecutiveFailures + 1} — ${queueBefore} items in queue`);

    const provider = new PublicOrdProvider(delayMs);
    const tracer = new CoinbaseTracer(db, provider);
    let processed = 0;

    try {
      await tracer.run("trace");
    } catch (err) {
      console.log(`[auto-trace] Run ended: ${err}`);
    }

    const state = getTraceState(db);
    const queueAfter = getQueueSize(db);
    // Estimate items processed from queue delta + new UTXOs discovered
    processed = Math.max(0, queueBefore - queueAfter + (queueAfter - queueBefore));
    const utxosFound = state?.total_utxos_found ?? 0;

    console.log(`[auto-trace] Result — ${utxosFound} UTXOs found, ${queueAfter} in queue`);
    db.close();

    if (stopping) break;

    // Check if run made meaningful progress
    const shortRun = queueBefore - queueAfter < MIN_PROGRESS && queueAfter > 0;

    if (shortRun) {
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`[auto-trace] ${MAX_CONSECUTIVE_FAILURES} consecutive short runs — API likely down. Stopping.`);
        console.log(`[auto-trace] Run again later with: npm run auto-trace`);
        break;
      }
      const backoff = Math.min(MAX_PAUSE, MIN_PAUSE * Math.pow(2, consecutiveFailures));
      console.log(`[auto-trace] Short run (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}) — waiting ${Math.round(backoff / 1000)}s...\n`);
      await new Promise((r) => setTimeout(r, backoff));
    } else {
      consecutiveFailures = 0;
      console.log(`[auto-trace] Good run — waiting ${MIN_PAUSE / 1000}s before next...\n`);
      await new Promise((r) => setTimeout(r, MIN_PAUSE));
    }
  }

  console.log("[auto-trace] Exited cleanly.");
}

run();
