import { getDb } from "../src/db/index";

const dbPath = process.env.DATABASE_PATH || "./bhang-tracker.db";
const confirmed = process.argv.includes("--yes");

if (!confirmed) {
  console.log("This clears trace_queue, utxos, inscriptions, and trace_state.");
  console.log("Run again with: npm run trace:reset -- --yes");
  process.exit(1);
}

const db = getDb(dbPath);

try {
  db.exec(`
    DELETE FROM trace_queue;
    DELETE FROM utxos;
    DELETE FROM inscriptions;
    DELETE FROM trace_state;
  `);
  console.log(`[reset] Cleared trace state in ${dbPath}`);
  console.log("[reset] Run: npm run trace:sats");
} finally {
  db.close();
}
