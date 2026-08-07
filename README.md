# track-prefix

Local FIFO sat-name **prefix** tracker. Generalized from the BHANG Series‑1 tracer — same conservation math, any mined prefix series you choose.

**Status:** local tool. Not a hosted service. Your DB stays on your machine.

## What this does

Given a sat-name prefix (e.g. `bhang`) and one **mined** series, it traces those sats from coinbase origins to current UTXOs using ordinal FIFO accounting, with a live dashboard on your machine.

## Why it must run on your machine

A browser tab cannot finish a multi-day public-API sync. Rate limits, ISP blocks, and queue state require a local worker + SQLite DB. That is intentional — you own the data and the compute.

## Prerequisites

- Node.js 20+
- Network access (public/paid API) **or** local bitcoind (+ optional ord)
- Disk space for SQLite databases under `data/jobs/` (one folder per tracked prefix series)

## Data modes (nothing hidden)

| Mode | You provide | Notes |
|------|-------------|--------|
| Public API | nothing | Works immediately; rate limits / ISP bans possible |
| Paid API | base URL + optional API key | Higher limits; still third-party |
| BTC node | RPC URL + user/password | Local bitcoind with `txindex=1` (Core 24+ recommended) |
| BTC + ord | RPC + ord HTTP URL | Same as BTC node, plus local ord for sat/inscription metadata |

## BTC node / ord setup

1. Run **mainnet** bitcoind with `txindex=1` (sat-name math is mainnet-native).
2. Optional: run **ord** with sat index for inscription scanning.
3. In the wizard choose **BTC node** or **BTC node + ord**, enter e.g.:
   - RPC `http://127.0.0.1:8332` + RPC user/password
   - ord `http://127.0.0.1:80` (btc_ord only)
4. Use **Test connection** before continuing.
5. Start tracing as usual — the dashboard stays on **:42069**; the DB is still under `data/jobs/`. The node is only a data source (not where track-prefix stores jobs).

Node modes are **not** limited to one tracer at a time (unlike public/paid API). URLs are free-form — you can point at other ports for connectivity smoke tests, but real prefix tracing expects mainnet.

## What to expect

- **First sync** of a large mined series (tens/hundreds of millions of sats) can take **hours to weeks** on public APIs.
- After the first complete pass, **refresh** is much lighter.
- Public Esplora endpoints may **429** or your ISP may temporarily block them — slow down (`API_DELAY_MS`) or use paid/own node.
- Only **mined** series can be UTXO-traced. Unmined series are shown but not trackable yet.

## Quick start

```bash
git clone <this-repo>
cd track-prefix
npm install
npm start
```

Open the printed URL (preferred port **42069**, or the next free port). Complete the browser wizard (or pick an existing job if you have tracked before), then:

```bash
npm run status
npm run trace:sats          # or: npm run index -- trace --no-scan
npm run refresh             # after initial complete
npm run snapshot            # writes tracker-data.json in the active job folder
```

## Job library

Each tracked prefix+series gets its own folder:

```
data/
  registry.json
  jobs/
    exquisite-s1/
      track.db
      provider-health.json
      tracker-data.json   # after npm run snapshot
```

The dashboard lists all jobs — open one to view its UTXOs and trace progress, or **+ New track** to add another. On **public/paid API** modes, only **one tracer** may run at a time across all jobs (pause/stop before switching or starting another).

Legacy single-DB installs (`track-prefix.db` + `config.json` at repo root) migrate automatically on first load.

## Optional publish

See [`docs/export-hosting.md`](docs/export-hosting.md). No auto-push.

## Design

- Spec: `docs/superpowers/specs/2026-08-07-track-prefix-design.md`
- Plan: `docs/superpowers/plans/2026-08-07-track-prefix.md`

## License / ownership

Your config (`config.json`) and databases under `data/` are gitignored. Do not commit secrets.
