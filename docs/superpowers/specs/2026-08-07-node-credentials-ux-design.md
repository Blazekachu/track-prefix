# Node credentials UX (BTC / BTC + ORD nodes)

## Goal

Make the wizard credentials step trustworthy and actionable: explain every field, never silently read auth files, optional cookie fill on explicit click, and Test connection that proves the tracer can run — with clear failures.

## Scope

- Wizard credentials step for `btc_node` and `btc_ord`
- Optional “Fill from Bitcoin cookie” (POST API, click-only)
- Stronger `probeProviderConnection` (auth, tip, mainnet, txindex, ord)
- Clear field labels / defaults / local-only disclaimer

Out of scope: custom datadir browser UI beyond optional cookie path override; forcing Test before Next.

## Local-only banner (CAPS)

Show prominently above node credential fields:

> THIS TOOL RUNS LOCALLY ON YOUR MACHINE. IT ONLY READS FROM YOUR BTC NODE (AND ORD IF SELECTED). IT NEVER WRITES TO BITCOIND OR ORD — IT ONLY WRITES TO THIS TRACKER’S LOCAL DATABASE UNDER `data/jobs/`.

## Fields

| Field | Required | Default | Notes |
|-------|----------|---------|-------|
| RPC URL | yes | `http://127.0.0.1:8332` | Editable; user’s node may differ |
| RPC user | yes | empty | From `bitcoin.conf` or cookie (`__cookie__`) |
| RPC password | yes | empty | Stored only in local `config.json` |
| ord URL | `btc_ord` only | `http://127.0.0.1:80` | Editable |

Help text: credentials stay on this machine; pre-fills are common local defaults, not universal.

## Cookie fill (Approach 2)

- Button: “Fill from Bitcoin cookie”
- Never runs on page load
- Server reads standard path (`%APPDATA%\Bitcoin\.cookie` on Windows, `~/.bitcoin/.cookie` elsewhere) or an optional path the user pasted
- Returns `{ rpcUser, rpcPassword }` (not logged); wizard fills fields
- If missing/unreadable: clear error with expected path

## Test connection

- Enabled only when all required fields for the mode are filled (including password)
- Checks: RPC reach + `getblockchaininfo` + mainnet + `txindex` synced via `getindexinfo` + (btc_ord) ord `/status`
- Success: tip + chain + txindex + ord OK
- Failure: actionable message (refused, auth, wrong chain, txindex missing, ord down)

## Next

Remains available when fields are filled for API modes. For `btc_node` / `btc_ord`, **Next stays disabled until Test connection succeeds** (and resets if credentials change).
