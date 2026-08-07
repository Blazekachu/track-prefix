# track-prefix — Design

**Date:** 2026-08-07  
**Status:** Approved design — pending user review of this written spec  
**Folder:** `F:\Users\akhil\Main\track-prefix` (new; becomes the public GitHub repo later)

## Goal

Give any user the same capability you built for BHANG Series 1 in Test Track: **FIFO-trace a mined sat-name prefix series to current UTXOs**, with live local status — without requiring them to maintain two repos or reverse-engineer scripts.

`track-prefix` is a **copy** of Test Track, generalized for any prefix. Original Test Track and the bhang.wtf publish pipeline stay untouched.

## Hard boundaries

1. **Do not modify** `F:\Users\akhil\Main\Test Track` or its private tracing workflow.
2. **Do not push** secrets, DBs, or API keys. Config and SQLite stay local and gitignored.
3. **Mined series only** for UTXO tracing. Unmined series are visible but cannot start a trace.
4. **Local-first.** No Google Auth, no hosted tracing, no auto-publish in v1.
5. **Ship order:** build and test locally → public GitHub when ready. prefix-satnames-tracker handoff is a later, separate change (button → this repo’s README only).

## Relationship to existing projects

| Project | Role after this work |
|---------|----------------------|
| **Test Track** | Your personal BHANG engine — unchanged |
| **bhang.wtf** | Your personal art + tracker page — unchanged |
| **prefix-satnames-tracker** | Public range finder; later links to `track-prefix` README on mined series |
| **track-prefix** | Public, user-runnable generalization of Test Track |

## Approach

**Lift Test Track into `track-prefix`, parameterize, don’t rewrite FIFO.**

- Copy the codebase (engine, providers, DB, dashboard patterns).
- Replace hard-coded BHANG ranges with a **job config** derived from prefix + series math.
- Keep FIFO / fee-retrace / conservation accounting behavior intact.
- Add a first-run browser wizard and clearer product packaging (README disclosures, modes).

## Architecture

```
track-prefix/
  README.md                 full disclosure: what / why / requirements / expectations
  config (gitignored)       mode + credentials + active job
  track-prefix.db           local SQLite (gitignored)
  src/
    core/                   sat math, prefix→series ranges (generalized)
    indexer/                fifo + tracer (logic preserved; seed from job config)
    providers/              Esplora / node / ord / paid-api adapters
    db/                     same accounting model, renamed DB file
    app/ + ui/              wizard + live dashboard on :42069
  scripts/                  start, trace, refresh, status, snapshot
  docs/superpowers/specs/   this design
```

### Boot & port

- Preferred port: **42069**.
- If occupied, bind the next available port and print the URL clearly in the terminal.
- One command starts the local server + worker control surface (exact script name locked in the implementation plan).

### First-run wizard (browser, blocking)

No tracing until the wizard completes. Nothing hidden.

1. **Disclosure** — what the tool does, why a local process is required, what “complete” means (conservation accounted, gap 0).
2. **Mode pick** — exactly one of:
   - BTC node only (RPC)
   - BTC + ORD nodes
   - Public API (no node)
   - Paid / subscribed public API (key + base URL)
3. **Permissions** — only fields required for that mode; saved to a gitignored local config.
4. **Target** — enter prefix → list series with mined/unmined → **Track enabled only for mined**.
5. **Expectations** — sat count, first-sync may be long on public APIs, rate-limit / ISP-ban risk, refresh is lighter later → confirm to start.

### Data modes (v1 intent)

| Mode | User provides | Notes |
|------|---------------|--------|
| BTC node | RPC URL + auth | Prefer own chain; may still need indexed lookups depending on adapter maturity |
| BTC + ord | RPC + ord endpoint | Best ordinals-aware context when wired |
| Public API | nothing (default Esplora list) | Works immediately; full rate-limit / ban disclosure |
| Paid API | base URL + API key | Higher limits; still third-party dependent |

The wizard always lists all four modes. If node/ord adapters are not ready in an early build, those options are visible but marked **not available yet** (not hidden). Public + paid may ship first; README matches the UI so nothing is silently missing.

### Engine parameterization

Today Test Track seeds from hard-coded BHANG `SERIES[0]`. In `track-prefix`:

- Active job: `{ prefix, seriesId, nameLength, satStart, satEnd, satCount, tipHeightAtStart }`.
- Series enumeration uses the same name↔sat / supply rules as prefix-satnames-tracker.
- Tracer seed and conservation **target** come from that job’s sat range.
- v1: **one active job per DB** (simple). Multi-job later if needed.
- DB file name: `track-prefix.db` (not `bhang-tracker.db`).
- Strip BHANG-only wallet-label narrative from the default public UX (optional user labels can come later).

### Dashboard

After wizard: live worker status — queue, conservation, UTXO table, last run / refresh — same job shape as Test Track, branded for track-prefix.

### Export (v1)

- `snapshot` script writes `tracker-data.json` for the active job.
- Docs explain how to host that file on any static site.
- **No** auto git commit/push (that remains your personal bhang.wtf recipe).

## Out of scope (v1)

- Google Auth / Drive / Sheets
- Hosted tracing on your servers
- Auto-publish to GitHub Pages
- Deep-link auto-open of `localhost:42069` from prefix-satnames-tracker
- Unmined-series UTXO tracing
- Modifying Test Track or bhang.wtf
- Multi-prefix concurrent jobs in one DB

## Error handling & disclosure

- Wizard and README state public-API rate limits and ISP blocking risk up front.
- Provider cooldowns / health file behavior preserved from Test Track.
- If tip/API unreachable: clear UI error; do not pretend progress.
- Unmined series: disabled control + short reason, not a silent failure.

## Testing

- Keep existing FIFO / conservation / provider tests from the copy.
- Add tests for: prefix → series ranges; mined vs unmined gate; job config seeding the target range.
- Local manual test with a **small mined prefix series** before any large run or public release.

## Success criteria

1. Fresh clone → install → one command → wizard on :42069 (or fallback port).
2. User can select mode, see required permissions, pick a mined series, start trace.
3. Conservation accounting still holds for a completed job.
4. Snapshot JSON export works; publish remains optional/manual.
5. Test Track directory is bit-identical in intent (untouched).

## Implementation note

Detailed task breakdown comes next via the writing-plans skill **after** you approve this written spec. No production push until you’ve tested locally.
