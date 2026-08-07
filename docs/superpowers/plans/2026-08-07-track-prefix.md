# track-prefix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first `track-prefix` app (copy of Test Track, untouched original) that FIFO-traces any user-chosen **mined** sat-name prefix series, with a browser wizard on port 42069 and snapshot JSON export.

**Architecture:** Copy Test Track into `F:\Users\akhil\Main\track-prefix`, keep `fifo.ts` / conservation math intact, replace hard-coded BHANG `SERIES` + coinbase block list with a job config + `splitIntoBlocks` seeding, add a blocking first-run wizard and four disclosed data modes (public/paid ready first; node/ord visible but may be marked unavailable).

**Tech Stack:** Next.js 16, React 19, better-sqlite3, TypeScript, Vitest, tsx scripts (same as Test Track).

**Spec:** `docs/superpowers/specs/2026-08-07-track-prefix-design.md`

**Hard rule:** Never modify `F:\Users\akhil\Main\Test Track` or bhang.wtf publish scripts.

---

## File map (target)

| Path | Responsibility |
|------|----------------|
| `package.json` | Rename to `track-prefix`; scripts `start`, `dev`, `trace`, `refresh`, `status`, `snapshot`, `test` |
| `.gitignore` | Ignore `track-prefix.db*`, `config.json`, `.track-prefix.env`, `provider-health.json`, `logs/` |
| `README.md` | Full disclosure: what/why/requirements/modes/expectations |
| `src/core/prefix.ts` | Validate prefix (a–z, length) |
| `src/core/series-ranges.ts` | `buildSeriesRanges(prefix)` (from prefix-satnames-tracker) |
| `src/core/segments.ts` | `splitIntoBlocks(satStart, satEnd)` for coinbase seed heights |
| `src/core/forecast.ts` | `classifyBlock` / mined gate for a series vs tip |
| `src/core/job-config.ts` | Load/save active job + mode config (gitignored file) |
| `src/core/series.ts` | Thin adapter: active job → Series-shaped object for DB/UI (no hard-coded bhang) |
| `src/indexer/tracer.ts` | Seed from job range + dynamic block heights (FIFO body unchanged) |
| `src/db/index.ts` | Default DB path `./track-prefix.db`; seed series row from job |
| `src/app/page.tsx` | Wizard if no config; else dashboard |
| `src/ui/wizard.tsx` | First-run wizard steps |
| `src/app/api/config/route.ts` | GET/POST config + tip lookup |
| `src/lib/port.ts` | Prefer 42069, else next free |
| `scripts/start-server.ts` | Bind port + run Next |
| `scripts/export-snapshot.ts` | Write `./tracker-data.json` for active job (no bhang.wtf path) |
| `docs/export-hosting.md` | How to host snapshot JSON yourself |

---

### Task 1: Scaffold copy (no engine changes yet)

**Files:**
- Create: everything under `F:\Users\akhil\Main\track-prefix\` except existing `docs/superpowers/`
- Do not touch: `F:\Users\akhil\Main\Test Track\**`

- [ ] **Step 1: Copy source tree excluding junk**

Run from PowerShell:

```powershell
$src = "F:\Users\akhil\Main\Test Track"
$dst = "F:\Users\akhil\Main\track-prefix"
$exclude = @("node_modules", ".next", ".git", "logs", "bhang-tracker.db", "bhang-tracker.db-shm", "bhang-tracker.db-wal", "bhang-tracker-backup-2026-05-15.db", "bhang-tracker-backup-2026-05-15.db-shm", "bhang-tracker-backup-2026-05-15.db-wal", "provider-health.json")
# Robocopy: copy src,ui,core,db,indexer,providers,scripts,public,docs from Test Track into track-prefix
robocopy "$src\src" "$dst\src" /E
robocopy "$src\scripts" "$dst\scripts" /E
robocopy "$src\public" "$dst\public" /E
Copy-Item "$src\package.json" "$dst\package.json" -Force
Copy-Item "$src\package-lock.json" "$dst\package-lock.json" -Force
Copy-Item "$src\tsconfig.json" "$dst\tsconfig.json" -Force
Copy-Item "$src\next.config.ts" "$dst\next.config.ts" -Force
Copy-Item "$src\postcss.config.mjs" "$dst\postcss.config.mjs" -Force
Copy-Item "$src\tailwind.config.ts" "$dst\tailwind.config.ts" -Force
Copy-Item "$src\vitest.config.ts" "$dst\vitest.config.ts" -Force
Copy-Item "$src\eslint.config.mjs" "$dst\eslint.config.mjs" -Force
Copy-Item "$src\.env.example" "$dst\.env.example" -Force
Copy-Item "$src\.gitignore" "$dst\.gitignore" -Force
Copy-Item "$src\BHANG-TRACER-SPEC.md" "$dst\BHANG-TRACER-SPEC.md" -Force
```

Keep existing `track-prefix\docs\superpowers\**` (design + this plan). Do **not** copy Test Track `.git`.

- [ ] **Step 2: Init git in track-prefix only**

```powershell
cd "F:\Users\akhil\Main\track-prefix"
git init
git status
```

Expected: new repo; `src/`, `scripts/`, design docs present; no `.db` files.

- [ ] **Step 3: Install and verify existing tests still pass on the copy**

```powershell
cd "F:\Users\akhil\Main\track-prefix"
npm install
npm test
```

Expected: Vitest passes (same as Test Track baseline).

- [ ] **Step 4: Commit scaffold**

```powershell
cd "F:\Users\akhil\Main\track-prefix"
git add -A
git commit -m "chore: scaffold track-prefix from Test Track copy"
```

---

### Task 2: Rebrand package identity & gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`
- Create: `AGENTS.md`
- Create: `README.md` (skeleton; full disclosure filled in Task 11)

- [ ] **Step 1: Update package.json name and scripts**

Set:

```json
{
  "name": "track-prefix",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "npx tsx scripts/start-server.ts",
    "build": "next build",
    "start": "npx tsx scripts/start-server.ts",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "seed": "npx tsx scripts/seed-db.ts",
    "index": "npx tsx scripts/index-sats.ts",
    "trace:sats": "npx tsx scripts/index-sats.ts trace --no-scan",
    "trace:repair": "npx tsx scripts/index-sats.ts repair --no-scan",
    "trace:reset": "npx tsx scripts/reset-trace-db.ts",
    "refresh": "npx tsx scripts/index-sats.ts refresh",
    "status": "npx tsx scripts/status.ts",
    "snapshot": "npx tsx scripts/export-snapshot.ts",
    "auto-trace": "npx tsx scripts/auto-trace.ts"
  }
}
```

Keep existing dependencies unchanged.

- [ ] **Step 2: Update .gitignore**

Replace BHANG DB entries with:

```
track-prefix.db
track-prefix.db-journal
track-prefix.db-wal
track-prefix.db-shm
track-prefix-backup-*
track-prefix.db.trace.lock
config.json
.track-prefix.env
provider-health.json
logs/
tracker-data.json
.env
```

Keep standard Node/Next ignores from the copy.

- [ ] **Step 3: Write AGENTS.md**

```markdown
# AGENTS.md — track-prefix

## Hard rules
1. Never modify `F:\Users\akhil\Main\Test Track` from this work.
2. Do not rewrite FIFO accounting in `src/indexer/fifo.ts` unless fixing a proven bug with a test.
3. Mined series only for UTXO tracing.
4. No secrets in git. Config + DB are local.

## Run
- `npm start` → wizard/dashboard on :42069 (or next free port)
- `npm test` · `npm run status` · `npm run snapshot`
```

- [ ] **Step 4: README skeleton**

```markdown
# track-prefix

Local FIFO sat-name prefix tracker (generalized from the BHANG tracer).

**Status:** local development — not a hosted service.

See `docs/superpowers/specs/2026-08-07-track-prefix-design.md`.

Full user disclosure (modes, risks, prerequisites) lands in a later task before public release.
```

- [ ] **Step 5: Commit**

```powershell
git add package.json .gitignore AGENTS.md README.md .env.example
git commit -m "chore: rebrand package to track-prefix"
```

---

### Task 3: Prefix validation + series ranges (TDD)

**Files:**
- Create: `src/core/prefix.ts`
- Create: `src/core/prefix.test.ts`
- Create: `src/core/series-ranges.ts`
- Create: `src/core/series-ranges.test.ts`
- Create: `src/core/segments.ts`
- Create: `src/core/segments.test.ts`
- Create: `src/core/forecast.ts`
- Create: `src/core/forecast.test.ts`

Reuse algorithms from `F:\Users\akhil\Main\prefix-satnames-tracker\src\core\` (copy logic, do not import across repos).

- [ ] **Step 1: Write failing prefix tests**

```typescript
// src/core/prefix.test.ts
import { describe, it, expect } from "vitest";
import { validatePrefix } from "./prefix";

describe("validatePrefix", () => {
  it("accepts lowercase a-z", () => {
    expect(validatePrefix("bhang")).toEqual({ ok: true, prefix: "bhang" });
  });
  it("rejects empty", () => {
    expect(validatePrefix("").ok).toBe(false);
  });
  it("rejects non a-z", () => {
    expect(validatePrefix("bh1").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```powershell
npm test -- src/core/prefix.test.ts
```

Expected: cannot find module `./prefix` or `validatePrefix` undefined.

- [ ] **Step 3: Implement validatePrefix**

```typescript
// src/core/prefix.ts
export type PrefixResult =
  | { ok: true; prefix: string }
  | { ok: false; error: string };

export function validatePrefix(raw: string): PrefixResult {
  const prefix = raw.trim().toLowerCase();
  if (!prefix) return { ok: false, error: "Prefix is required." };
  if (!/^[a-z]+$/.test(prefix)) {
    return { ok: false, error: "Prefix must be lowercase a–z only." };
  }
  if (prefix.length > 11) {
    return { ok: false, error: "Prefix cannot exceed 11 letters." };
  }
  return { ok: true, prefix };
}
```

- [ ] **Step 4: Write series-ranges + segments + forecast tests**

Include at least:

```typescript
// series-ranges.test.ts — bhang series 1 sat count
import { buildSeriesRanges } from "./series-ranges";

it("bhang series 1 has 308915776 sats", () => {
  const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
  expect(s1.satCount).toBe(308_915_776n);
});

// segments.test.ts — bhang s1 spans blocks 579124–579125
import { splitIntoBlocks } from "./segments";

it("splits bhang s1 into two origin blocks", () => {
  const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
  const segs = splitIntoBlocks(s1.satStart, s1.satEnd);
  expect(segs.map((s) => Number(s.height))).toEqual([579124, 579125]);
});

// forecast.test.ts
import { seriesIsMined } from "./forecast";

it("marks series mined only when all blocks <= tip", () => {
  const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
  expect(seriesIsMined(s1, 579125n)).toBe(true);
  expect(seriesIsMined(s1, 579123n)).toBe(false);
});
```

Implement `buildSeriesRanges` like prefix-satnames-tracker `series.ts`, `splitIntoBlocks` like its `segments.ts` (ensure `blockFirstSat` / `blockSubsidy` exist in `sat-math.ts` — add them if missing, with tests).

```typescript
// forecast.ts
import { splitIntoBlocks } from "./segments";
import type { SeriesRange } from "./series-ranges";

export function seriesIsMined(series: SeriesRange, tip: bigint): boolean {
  const segs = splitIntoBlocks(series.satStart, series.satEnd);
  if (segs.length === 0) return false;
  return segs.every((s) => s.height <= tip);
}
```

- [ ] **Step 5: Run tests — expect PASS**

```powershell
npm test -- src/core/prefix.test.ts src/core/series-ranges.test.ts src/core/segments.test.ts src/core/forecast.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add src/core/prefix.ts src/core/prefix.test.ts src/core/series-ranges.ts src/core/series-ranges.test.ts src/core/segments.ts src/core/segments.test.ts src/core/forecast.ts src/core/forecast.test.ts src/core/sat-math.ts src/core/sat-math.test.ts
git commit -m "feat(core): add prefix series ranges and block splits"
```

---

### Task 4: Job config module (TDD)

**Files:**
- Create: `src/core/job-config.ts`
- Create: `src/core/job-config.test.ts`

- [ ] **Step 1: Write failing tests for save/load and mined gate**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  saveConfig,
  loadConfig,
  configPath,
  type TrackPrefixConfig,
} from "./job-config";

describe("job-config", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tp-cfg-"));
  beforeEach(() => {
    process.env.TRACK_PREFIX_CONFIG = path.join(dir, "config.json");
  });
  afterEach(() => {
    delete process.env.TRACK_PREFIX_CONFIG;
  });

  it("round-trips config", () => {
    const cfg: TrackPrefixConfig = {
      version: 1,
      wizardComplete: true,
      mode: "public_api",
      modeCredentials: {},
      job: {
        prefix: "bhang",
        seriesId: 1,
        nameLength: 11,
        satStart: "1773906020861562",
        satEnd: "1773906329777337",
        satCount: "308915776",
        tipHeightAtStart: 900000,
      },
    };
    saveConfig(cfg);
    expect(loadConfig()).toEqual(cfg);
  });

  it("returns null when missing", () => {
    expect(loadConfig()).toBeNull();
  });
});
```

- [ ] **Step 2: Implement job-config.ts**

```typescript
import fs from "fs";
import path from "path";

export type DataMode =
  | "btc_node"
  | "btc_ord"
  | "public_api"
  | "paid_api";

export interface TrackJob {
  prefix: string;
  seriesId: number;
  nameLength: number;
  satStart: string;
  satEnd: string;
  satCount: string;
  tipHeightAtStart: number;
}

export interface TrackPrefixConfig {
  version: 1;
  wizardComplete: boolean;
  mode: DataMode;
  modeCredentials: {
    rpcUrl?: string;
    rpcUser?: string;
    rpcPassword?: string;
    ordUrl?: string;
    apiBaseUrl?: string;
    apiKey?: string;
  };
  /** Modes not yet wired show in UI but cannot be selected to start. */
  modeAvailability?: Partial<Record<DataMode, "ready" | "coming_soon">>;
  job: TrackJob | null;
}

export function configPath(): string {
  return (
    process.env.TRACK_PREFIX_CONFIG ||
    path.resolve(process.cwd(), "config.json")
  );
}

export function loadConfig(): TrackPrefixConfig | null {
  const p = configPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as TrackPrefixConfig;
}

export function saveConfig(cfg: TrackPrefixConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

export function defaultModeAvailability(): Record<
  DataMode,
  "ready" | "coming_soon"
> {
  return {
    public_api: "ready",
    paid_api: "ready",
    btc_node: "coming_soon",
    btc_ord: "coming_soon",
  };
}
```

- [ ] **Step 3: Run tests — PASS**

```powershell
npm test -- src/core/job-config.test.ts
```

- [ ] **Step 4: Commit**

```powershell
git add src/core/job-config.ts src/core/job-config.test.ts
git commit -m "feat(core): add local job config load/save"
```

---

### Task 5: Parameterize tracer seeding (keep FIFO)

**Files:**
- Modify: `src/indexer/tracer.ts` (seed + repair series id / block list only)
- Modify: `src/core/series.ts` (drive from job config)
- Modify: `src/db/index.ts` (DB path + series seed from job)
- Modify: `src/db/queries.ts` where `SERIES[seriesId - 1]` assumes global BHANG table — use active job range
- Test: `src/indexer/tracer-seed.test.ts` (unit test pure helpers if extracted)

- [ ] **Step 1: Extract pure helper for origin block heights**

```typescript
// src/core/origin-blocks.ts
import { splitIntoBlocks } from "./segments";

export function originBlockHeights(
  satStart: bigint,
  satEnd: bigint
): number[] {
  return splitIntoBlocks(satStart, satEnd).map((s) => Number(s.height));
}
```

Test: bhang s1 → `[579124, 579125]`.

- [ ] **Step 2: Change seedRangeFromCoinbase to use dynamic heights**

In `tracer.ts`, replace:

```typescript
for (const blockHeight of [579124, 579125]) {
```

with:

```typescript
const heights = this.originHeights;
for (const blockHeight of heights) {
```

Where `originHeights` is set in the constructor from the active job:

```typescript
constructor(
  db: Database.Database,
  provider: OrdProvider,
  private targetRange: SatRange,
  private originHeights: number[],
  private seriesId: number = 1
) { ... }
```

Replace `SERIES[0]` seed with `this.targetRange`. Replace hard-coded `getTraceGaps(this.db, 1)` / `deleteQueuedRangesCoveredByLiveUtxos(this.db, 1)` with `this.seriesId`.

- [ ] **Step 3: Wire series.ts + db from job**

`getActiveSeries()` reads `loadConfig()?.job` and returns one `Series` object (id, nameLength, satStart/End as bigint, mined: true).  
`initSchema` / seed inserts that one series row.  
Default `DATABASE_PATH` → `./track-prefix.db`.

Update `scripts/index-sats.ts` (or equivalent entry) to construct `CoinbaseTracer` with job range + `originBlockHeights`.

- [ ] **Step 4: Run full test suite**

```powershell
npm test
```

Expected: all pass. Fix any BHANG-hardcoded test paths that break.

- [ ] **Step 5: Commit**

```powershell
git add src/indexer/tracer.ts src/core/series.ts src/core/origin-blocks.ts src/core/origin-blocks.test.ts src/db/index.ts src/db/queries.ts scripts/index-sats.ts
git commit -m "feat(tracer): seed from job sat range and origin blocks"
```

---

### Task 6: Port binder + start script (42069)

**Files:**
- Create: `src/lib/port.ts`
- Create: `src/lib/port.test.ts`
- Create: `scripts/start-server.ts`

- [ ] **Step 1: Write port helper tests**

```typescript
import { describe, it, expect } from "vitest";
import { pickPort } from "./port";

describe("pickPort", () => {
  it("prefers 42069 when free", async () => {
    const port = await pickPort(42069);
    expect(port).toBeGreaterThanOrEqual(42069);
  });
});
```

- [ ] **Step 2: Implement pickPort**

```typescript
import net from "net";

function canListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });
}

/** Prefer preferredPort; otherwise scan upward a limited range. */
export async function pickPort(
  preferredPort = 42069,
  maxTries = 50
): Promise<number> {
  for (let i = 0; i < maxTries; i++) {
    const port = preferredPort + i;
    if (await canListen(port)) return port;
  }
  throw new Error(
    `No free port found from ${preferredPort} to ${preferredPort + maxTries - 1}`
  );
}
```

- [ ] **Step 3: start-server.ts**

```typescript
import { spawn } from "child_process";
import { pickPort } from "../src/lib/port";

async function main() {
  const port = await pickPort(42069);
  console.log(`[track-prefix] listening on http://127.0.0.1:${port}`);
  if (port !== 42069) {
    console.log(`[track-prefix] 42069 busy — using next free port ${port}`);
  }
  const child = spawn(
    "npx",
    ["next", "dev", "-H", "127.0.0.1", "-p", String(port)],
    { stdio: "inherit", shell: true }
  );
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Smoke-run**

```powershell
npm start
```

Expected: terminal prints `http://127.0.0.1:42069` (or fallback); Ctrl+C to stop.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/port.ts src/lib/port.test.ts scripts/start-server.ts package.json
git commit -m "feat: prefer port 42069 with fallback"
```

---

### Task 7: Config API + wizard UI

**Files:**
- Create: `src/app/api/config/route.ts`
- Create: `src/app/api/tip/route.ts`
- Create: `src/ui/wizard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/ui/header.tsx` (rebrand title)

- [ ] **Step 1: Tip API**

`GET /api/tip` — fetch tip via existing Esplora client; return `{ height: number }` or 503 with clear error.

- [ ] **Step 2: Config API**

- `GET /api/config` → `loadConfig()` + `defaultModeAvailability()`
- `POST /api/config` → body is `TrackPrefixConfig`; validate prefix/series with `seriesIsMined`; reject unmined with 400 `{ error: "Only mined series can be tracked." }`; `saveConfig`

- [ ] **Step 3: Wizard UI steps**

Client component `Wizard`:

1. Disclosure copy (what/why/local process/conservation).
2. Mode cards — all four visible; `coming_soon` disabled with label.
3. Credential fields for selected ready mode only.
4. Prefix input → fetch tip → list series with mined/unmined badges → Track only if mined.
5. Expectations + Confirm → POST config → reload to dashboard.

- [ ] **Step 4: page.tsx gate**

```tsx
import { loadConfig } from "@/core/job-config";
import { Wizard } from "@/ui/wizard";
// existing dashboard imports

export default function Page() {
  const cfg = loadConfig();
  if (!cfg?.wizardComplete || !cfg.job) {
    return <Wizard />;
  }
  return (/* existing dashboard layout, rebranded */);
}
```

If `loadConfig` cannot run in a server component path cleanly, use a thin client wrapper that GETs `/api/config` and branches.

- [ ] **Step 5: Manual check**

```powershell
npm start
```

Open printed URL → wizard appears → complete with `public_api` + small mined prefix if possible → dashboard.

- [ ] **Step 6: Commit**

```powershell
git add src/app/api/config/route.ts src/app/api/tip/route.ts src/ui/wizard.tsx src/app/page.tsx src/ui/header.tsx
git commit -m "feat(ui): add first-run wizard and config APIs"
```

---

### Task 8: Provider mode wiring (public + paid ready)

**Files:**
- Modify: `src/providers/public-provider.ts` / `esplora-client.ts` (User-Agent `track-prefix/0.1`)
- Modify: provider bootstrap used by `index-sats.ts` to read `mode` + credentials from config
- Create: `src/providers/mode.test.ts`

- [ ] **Step 1: Tests for resolveEsploraBases(config)**

```typescript
it("public_api uses default bases", () => {
  expect(resolveEsploraBases({ mode: "public_api", modeCredentials: {} }).length).toBeGreaterThan(0);
});
it("paid_api requires base URL", () => {
  expect(() =>
    resolveEsploraBases({ mode: "paid_api", modeCredentials: {} })
  ).toThrow(/apiBaseUrl/);
});
```

- [ ] **Step 2: Implement resolveEsploraBases**

- `public_api` → existing default list  
- `paid_api` → `[apiBaseUrl]` + API key header if present  
- `btc_node` / `btc_ord` → throw clear “coming soon” if selected somehow

- [ ] **Step 3: Rename User-Agent to track-prefix/0.1**

- [ ] **Step 4: Commit**

```powershell
git add src/providers/*.ts scripts/index-sats.ts
git commit -m "feat(providers): wire public and paid API modes from config"
```

---

### Task 9: Snapshot export + hosting doc

**Files:**
- Modify: `scripts/export-snapshot.ts`
- Create: `docs/export-hosting.md`

- [ ] **Step 1: Change output path**

Default output: `path.resolve(process.cwd(), "tracker-data.json")`  
Optional env `SNAPSHOT_OUT`.

Remove hard-coded bhang.wtf output path and BHANG-only `SPECIAL_SATS` list (or compute uncommon = first sat of each origin block dynamically; skip BHANG name table).

Rename export field `bhang_sats` → `tracked_sats` in multi-wallet aggregate.

- [ ] **Step 2: docs/export-hosting.md**

Explain: run `npm run snapshot`, host `tracker-data.json` on any static host, point a page at it — no auto-push.

- [ ] **Step 3: Commit**

```powershell
git add scripts/export-snapshot.ts docs/export-hosting.md
git commit -m "feat: export tracker-data.json for optional self-hosting"
```

---

### Task 10: Strip BHANG-only UX; status script; README disclosure

**Files:**
- Modify: `src/ui/*.tsx` titles/copy
- Modify: `scripts/status.ts` banner text
- Modify: `src/core/wallet-labels.ts` — empty default map for public product (keep file, clear BHANG-specific entries)
- Modify: `README.md` — full disclosure

- [ ] **Step 1: README sections (required)**

Must include:

1. What this repo does  
2. Why it must run on your machine  
3. Machine prerequisites (Node 20+)  
4. Four modes + permissions each needs  
5. What to expect (first sync duration, rate limits, ISP bans)  
6. Mined-only rule  
7. Commands: `npm install`, `npm start`, `npm run status`, `npm run snapshot`  
8. Link to design spec + export-hosting doc  

- [ ] **Step 2: Manual pass**

- Wizard copy has no “BHANG” as product name  
- Status output says track-prefix  
- `npm test` green  

- [ ] **Step 3: Commit**

```powershell
git add README.md src/ui scripts/status.ts src/core/wallet-labels.ts
git commit -m "docs: full disclosure README and strip BHANG product UX"
```

---

### Task 11: Local verification checklist (no public push)

- [ ] **Step 1: Confirm Test Track untouched**

```powershell
cd "F:\Users\akhil\Main\Test Track"
git status
```

Expected: clean or only pre-existing local changes — **no commits from this work**.

- [ ] **Step 2: End-to-end local**

1. Delete `config.json` / `track-prefix.db` if present (fresh wizard).  
2. `npm start` → :42069  
3. Complete wizard with `public_api`  
4. Pick a **small** mined series (not full bhang s1 for CI-time) if available; or configure bhang s1 but only run `npm run status` without full multi-week trace  
5. `npm run snapshot` produces `tracker-data.json`  

- [ ] **Step 3: Final commit if verification fixed nits**

```powershell
git add -A
git commit -m "chore: local verification nits"
```

Do **not** `git push` / create GitHub remote until the user asks.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Copy Test Track; leave original untouched | 1, 11 |
| Port 42069 + fallback | 6 |
| Browser wizard before trace | 7 |
| Four modes, nothing hidden; node/ord may be coming_soon | 4, 7, 8 |
| Mined-only UTXO track | 3 (`seriesIsMined`), 7 API gate |
| Parameterize engine; keep FIFO | 5 |
| Snapshot JSON + docs; no auto-publish | 9 |
| Full README disclosure | 10 |
| Local test before live | 11 |
| prefix-satnames button later | Out of scope (spec) — not in this plan |

No TBD placeholders remain. Types: `TrackPrefixConfig`, `DataMode`, `TrackJob` used consistently across Tasks 4–8.
