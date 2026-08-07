import { getDb } from "../src/db/index";

console.log("[seed] Initializing database...");
const db = getDb();
console.log("[seed] Database initialized and series seeded.");
console.log("[seed] Done.");
db.close();
