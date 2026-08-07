# track-prefix

**Version 0.1.0** · **MIT License**

Local-first **FIFO sat-name prefix tracer**. Pick any mined sat-name prefix series (e.g. `exquisite`, `bhang`), walk sats from coinbase to live UTXOs with ordinal FIFO accounting, and watch progress on a dashboard that runs on your machine.

This is a **local tool**, not a hosted service. Your SQLite databases and credentials stay on your computer. You own the data and the compute.

You are free to **clone, fork, modify, build on, and redistribute** this project under the [MIT License](./LICENSE).

---

## Table of contents

- [What it does](#what-it-does)
- [Why it runs on your machine](#why-it-runs-on-your-machine)
- [Version 0.1 scope](#version-01-scope)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Data modes](#data-modes)
- [Wizard & credentials](#wizard--credentials)
- [Job library (`data/jobs/`)](#job-library-datajobs)
- [Dashboard & tracing](#dashboard--tracing)
- [Inscription scanning](#inscription-scanning)
- [CLI scripts](#cli-scripts)
- [Deleting a job folder](#deleting-a-job-folder)
- [Optional publish](#optional-publish)
- [Project layout](#project-layout)
- [Contributing / forking](#contributing--forking)
- [License](#license)
- [Disclaimer](#disclaimer)

---

## What it does

1. You choose a **sat-name prefix** and one **mined** series (name-length cohort for that prefix).
2. A worker traces those sats from their coinbase origins to current UTXOs using **ordinal FIFO**.
3. Progress, live UTXOs, wallets, and conservation gap live in a local Next.js dashboard (preferred port **42069**).
4. Optionally, after UTXO trace is **complete** (gap 0), you can scan live UTXOs for inscriptions (mode-dependent).

“Complete” means conservation accounting reaches **gap 0** for the chosen sat range — not “every possible inscription on Earth.”

---

## Why it runs on your machine

A browser tab alone cannot finish a multi-day public-API sync. Rate limits, ISP blocks, locks, and queue state need a **local worker + SQLite**. That is intentional.

```
THIS TOOL RUNS LOCALLY ON YOUR MACHINE.
IT ONLY READS FROM YOUR BTC NODE (AND ORD IF SELECTED).
IT NEVER WRITES TO BITCOIND OR ORD —
IT ONLY WRITES TO THIS TRACKER'S LOCAL DATABASE UNDER data/jobs/.
```

---

## Version 0.1 scope

Included in **0.1**:

| Area | Status |
|------|--------|
| Public Esplora API mode | Ready |
| Paid / custom Esplora API mode | Ready |
| BTC node (bitcoind RPC) mode | Ready |
| BTC + ORD nodes mode | Ready |
| Multi-job library (`data/jobs/<id>/`) | Ready |
| Pause / stop / resume tracer | Ready |
| Mining forecast for unmined series | Ready (read-only %) |
| Inscription scan (first-sat; every-sat on BTC+ORD) | Ready |
| Cookie fill + Test connection for node modes | Ready |
| Heal / remove when a job folder is deleted | Ready |

Not a hosted SaaS. No cloud sync of your DB.

---

## Prerequisites

- **Node.js 20+**
- Network access **or** local **mainnet** bitcoind (`txindex=1`, Core 24+ recommended) and optionally **ord**
- Disk for SQLite under `data/jobs/` (one folder per tracked prefix series)

---

## Quick start

```bash
git clone https://github.com/Blazekachu/track-prefix.git
cd track-prefix
npm install
npm start
```

Open the printed URL (preferred **http://127.0.0.1:42069**). Complete the browser wizard, or open an existing job.

```bash
npm test                 # unit tests
npm run status           # CLI status for active job
npm run trace:sats       # start UTXO tracer (CLI)
npm run refresh          # after initial complete
npm run snapshot         # export tracker-data.json for optional hosting
```

---

## Data modes

Nothing is hidden. Pick one in the wizard:

| Mode | You provide | UTXO trace | Inscriptions |
|------|-------------|------------|--------------|
| **Public API** | Nothing | Public Esplora | First-sat scan via public ordinals endpoints |
| **Paid / subscribed API** | Esplora base URL (+ optional key) | Your endpoint | Same style as public |
| **BTC node (RPC)** | RPC URL + user + password | Your bitcoind | Not available (no inscription index) |
| **BTC + ORD nodes** | RPC + ord HTTP URL | bitcoind + local ord | First-sat or **every sat** |

- Public / paid: **one tracer at a time** across all jobs (pause/stop before starting another).
- Node modes: not limited to one tracer that way (still one lock per job).
- Pre-filled URLs (`http://127.0.0.1:8332`, ord `:80`) are **local defaults** — change them if your node listens elsewhere.

---

## Wizard & credentials

1. Disclosure → choose mode → credentials → list mined series → expectations → start.
2. For **BTC node** / **BTC + ORD nodes**:
   - Clear field labels; credentials stored only in local `config.json` (gitignored).
   - Optional **Fill from Bitcoin cookie** (click-only; never on page load).
   - **Test connection** enabled only when all fields are filled; checks reachability, **mainnet**, **txindex**, and ord when needed.
   - **Next** unlocks only after a successful Test connection.
3. Failures name the step (`rpc` / `chain` / `txindex` / `ord`) so you can fix them.

---

## Job library (`data/jobs/`)

Each tracked prefix + series gets its own folder:

```
data/
  registry.json
  jobs/
    exquisite-s1/
      track.db
      provider-health.json
      tracker-data.json   # after npm run snapshot
```

- Dashboard **TRACKED JOBS**: open, **+ New track**, or **Remove**.
- Prefer **Remove** in the UI over deleting folders by hand.
- Legacy root `track-prefix.db` + `config.json` migrate automatically on first load.

`config.json` and everything under `data/` are **gitignored**. Do not commit RPC passwords or API keys.

---

## Dashboard & tracing

- Series cards: mining % for all series; **Start / Pause / Stop / Resume / Refresh** when mined and trackable.
- Trace progress: conservation bar, queue, live UTXOs, DB last updated.
- Closing the dashboard does **not** stop a detached tracer — use Pause/Stop (or stop the worker process).

---

## Inscription scanning

After UTXO track is **complete**:

- **Public / paid / BTC + ORD** — Inscription track panel: Start / Pause / Stop / Resume.
- Default: **1st sat per UTXO** (common inscription seat).
- **Scan every sat** — **BTC + ORD nodes** only.
- **BTC node alone** — panel explains inscriptions need ord (or API mode).

```bash
npm run scan:inscriptions
```

---

## CLI scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Dashboard + API (port 42069 preferred) |
| `npm run trace:sats` | UTXO FIFO tracer |
| `npm run refresh` | Re-check live UTXOs after complete |
| `npm run scan:inscriptions` | Inscription worker |
| `npm run status` | Active job status |
| `npm run snapshot` | Write `tracker-data.json` |
| `npm test` | Vitest suite |

---

## Deleting a job folder

If you delete `data/jobs/<id>/` while the registry still lists that job:

- The app **heals** an empty folder so the dashboard can load again (prior UTXO progress is gone).
- You get a clear notice and a **recommended + New track** button (wizard), or you can **Remove** the ghost job / Start on the empty DB.

---

## Optional publish

See [`docs/export-hosting.md`](docs/export-hosting.md). Snapshot export is **manual** — no auto-push of your DB.

---

## Project layout

```
src/
  app/          # Next.js UI + API routes
  core/         # FIFO, jobs, modes, mining progress
  db/           # SQLite schema + queries
  providers/    # Esplora, bitcoind RPC, local ord
  ui/           # Dashboard components
scripts/        # CLI workers (trace, scan, status, …)
docs/           # Design notes and hosting guide
```

Design notes (optional reading):

- `docs/superpowers/specs/2026-08-07-track-prefix-design.md`
- `docs/superpowers/specs/2026-08-07-node-credentials-ux-design.md`

---

## Contributing / forking

Under **MIT** you may:

- **Clone** and run locally  
- **Fork** and build your own features or hosted frontends on top of exported snapshots  
- **Modify** FIFO tooling, providers, or UI  
- **Redistribute** with the license notice kept intact  

Suggested workflow:

```bash
git clone https://github.com/Blazekachu/track-prefix.git
cd track-prefix
npm install
npm test
npm start
```

PRs that improve docs, tests, provider robustness, or UX are welcome. Please do not open issues that ask maintainers to run your personal node or share private `config.json` / DB contents.

---

## License

[MIT](./LICENSE) © 2026 Blazekachu

---

## Disclaimer

This software is provided **as is**, with no warranty. Bitcoin node / API use, disk, and network costs are yours. Sat-name and ordinal tooling depends on community conventions and third-party indexes; verify results yourself before acting on them. Not financial advice.
