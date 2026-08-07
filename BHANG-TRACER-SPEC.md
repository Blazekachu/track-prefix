# BHANG Sat Tracer — Complete Specification

## Goal

Trace every single sat in a specific ordinal range (308,915,776 sats) from their origin as block subsidy in 2019 to their current UTXO locations on Bitcoin. Not one sat can be missed.

---

## The BHANG Ordinal Range

BHANG is a generative art project. Series 1 covers all ordinal names that are 11 characters long and start with "bhang" (from `bhangaaaaaa` to `bhangzzzzzz`).

These names map to a contiguous ordinal number range:

- **Start sat:** 1,773,906,020,861,562
- **End sat:** 1,773,906,329,777,337
- **Total sats:** 308,915,776 (~3.09 BTC worth of ordinal index space)

These ordinals were created as **subsidy sats** across two consecutive blocks:

| Block | Subsidy | BHANG Overlap |
|-------|---------|---------------|
| 579,124 | 1,250,000,000 (12.5 BTC) | 229,138,438 sats |
| 579,125 | 1,250,000,000 (12.5 BTC) | 79,777,338 sats |
| **Total** | | **308,915,776 sats** |

The BHANG range is a **subset** of the subsidy of these two blocks, NOT the entire subsidy. Each block produces 12.5 BTC (1.25 billion sats) of subsidy. The BHANG range spans approximately the last ~229M sats of block 579124's subsidy and the first ~80M sats of block 579125's subsidy.

### How to compute the range

Ordinal names map to sat numbers via the ordinals protocol formula:

```
SUPPLY = 2,099,999,997,690,000

function nameToSat(name):
  x = 0
  for each character ch in name:
    x = x * 26 + (ch - 'a') + 1
  return SUPPLY - x

function satToName(sat):
  x = SUPPLY - sat
  name = ""
  while x > 0:
    x -= 1
    name = chr(x % 26 + 'a') + name
    x = x / 26  (integer division)
  return name
```

Series 1 range:
```
firstName = "bhangaaaaaa"  (11 chars)
lastName  = "bhangzzzzzz"  (11 chars)
satStart  = nameToSat(firstName)  or  nameToSat(lastName)  (whichever is smaller)
satEnd    = nameToSat(firstName)  or  nameToSat(lastName)  (whichever is larger)
```

### Which blocks contain these sats

Use ordinal theory's block-to-sat mapping:

```
function blockFirstSat(height):
  sat = 0
  subsidy = 5,000,000,000
  h = 0
  for epoch 0..63:
    epochEnd = h + 210,000
    if height < epochEnd:
      return sat + (height - h) * subsidy
    sat += 210,000 * subsidy
    h = epochEnd
    subsidy /= 2
  return sat

function blockSubsidy(height):
  subsidy = 5,000,000,000
  epoch = height / 210,000  (integer)
  for i in 0..epoch-1:
    subsidy /= 2
  return subsidy
```

Block 579,124 is in halving epoch 2 (blocks 420,000–629,999), subsidy = 1,250,000,000 sats.

---

## How Sats Move in Bitcoin (Ordinal Theory FIFO)

When a Bitcoin transaction spends inputs to create outputs, ordinal theory assigns specific sats to specific outputs using **First-In-First-Out (FIFO)**:

1. **Concatenate all input sats** in input order. Input 0's sats come first, then input 1's, etc.
2. **Fill outputs in order.** Output 0 gets the first N sats (where N = output 0's value), output 1 gets the next M sats, etc.
3. **Fee sats** are whatever input sats remain after all outputs are filled. These go to the **miner's coinbase transaction** of the block that confirmed this TX.

### Example

```
Inputs:  [A: 100 sats] [B: 50 sats]  → stream: [A0..A99, B0..B49] = 150 sats
Outputs: [X: 80 sats]  [Y: 60 sats]  → total: 140 sats
Fee: 10 sats

X gets: A0..A79     (first 80 from stream)
Y gets: A80..A99, B0..B39  (next 60)
Fee:    B40..B49    (last 10 → miner coinbase)
```

### Input offset matters

If you're tracking a SUBSET of sats within a UTXO, you must know their **offset within the input**. For example, if input A has 1000 sats but you only track sats 500-700, those sats are at positions `streamOffset + 500` to `streamOffset + 700` in the concatenated input stream, NOT at `streamOffset + 0`.

### Coinbase transactions are special

Coinbase TXs create new sats (subsidy) AND collect fee sats:
- **Subsidy sats** come first: new ordinals `[blockFirstSat, blockFirstSat + subsidy - 1]`
- **Fee sats** come after: existing ordinals from spent transactions, in block TX-index order

When a coinbase output is later spent, the ordinals within it are ordered: subsidy sats first (at position 0), then fee sats. The BHANG sats within a coinbase output are at a specific offset that must be tracked.

---

## What the Tracer Must Do

### 1. Seed from coinbase

For blocks 579,124 and 579,125:
1. Fetch the coinbase transaction
2. Map subsidy sats to coinbase outputs using FIFO
3. Compute the intersection of BHANG range with each output's subsidy portion
4. Record the **input_offset** (position of BHANG sats within the output)
5. If the output is unspent → record as UTXO
6. If the output is spent → add to trace queue with the sat range and input_offset

### 2. Process trace queue

For each queue item (an outpoint with a tracked sat range and input_offset):

1. Check if the output is spent
2. If **unspent** → record as live UTXO (we found where these sats currently are)
3. If **spent** → fetch the spending TX and:
   a. Find which input corresponds to our outpoint
   b. Compute `streamOffset` = sum of all input values before ours
   c. Compute `streamPosition` = streamOffset + input_offset
   d. Map tracked sats through outputs using FIFO:
      - For each output, check if `[streamPosition, streamPosition + rangeSize - 1]` overlaps with `[outStart, outEnd]`
      - If overlap: compute new sat range and new input_offset for that output
      - If output is spent → enqueue for further tracing
      - If output is unspent → record as UTXO
   e. **Check for fee sats:** if `streamPosition + rangeSize > totalOutputValue`, some tracked sats became fees

### 3. Trace fee sats to coinbase

When BHANG sats are paid as transaction fees:

1. They go to the **coinbase TX** of the block that confirmed the spending TX
2. Their position in the coinbase = `subsidy + cumulative_fees_of_prior_TXs + fee_internal_offset`
3. To compute this:
   a. Get the block's transaction list (ordered)
   b. Find the spending TX's index in the block
   c. Sum fees of all TXs before it (skip coinbase at index 0)
   d. The mempool.space API `/api/block/{hash}/txs/{startIndex}` returns 25 TXs per page with fee data
4. Map the fee sats to coinbase outputs using FIFO (same as step 2d)
5. Enqueue or record those coinbase outputs

### 4. Handle recursive fee cycles

Fee sats land in a coinbase output. That output can later be spent, and those sats can become fees AGAIN. The tracer handles this naturally — coinbase outputs are traced like any other UTXO. No special case needed.

---

## Critical Edge Cases & Bugs We Hit

### Bug 1: FIFO input offset

**Problem:** When tracking a subset of sats within a UTXO, the tracer assumed they start at position 0 in the input. They don't — they can be at any offset.

**Fix:** Store `input_offset` with each queue item and UTXO. Use `streamPosition = streamOffset + inputOffset` instead of just `streamOffset`.

### Bug 2: Fee sats not traced

**Problem:** When tracked sats become transaction fees, they were silently dropped. The tracer never followed them to the miner's coinbase.

**Fix:** After mapping sats to outputs, check if any sats fall beyond `totalOutputValue`. If so, compute their position in the coinbase and trace them there.

### Bug 3: Queue deduplication too aggressive

**Problem:** The queue used outpoint-only dedup. When multiple trace paths converge on the same outpoint (e.g., a miner's coinbase receives BHANG fee sats from multiple TXs), only the first path's sat range was queued. Others were silently dropped.

**Fix:** Dedup on `(outpoint, sat_range_start, sat_range_end)` instead of just `outpoint`.

### Bug 4: UTXO table primary key

**Problem:** The UTXOs table used `outpoint` as primary key. When the same outpoint carries multiple BHANG sat ranges (from different fee paths converging on one coinbase output), each upsert overwrote the previous range.

**Fix:** Composite primary key `(outpoint, sat_range_start)`. Same outpoint can have multiple rows with different sat ranges.

### Bug 5: Visited set blocking error retries

**Problem:** On network error, the item was re-queued for retry. But the in-memory `visited` set already marked it as processed, so the retry was silently skipped. This caused entire branches of the trace tree (potentially millions of sats) to be lost.

**Fix:** Only add to `visited` set AFTER successful processing, not before.

---

## Data Model

### trace_queue
```sql
CREATE TABLE trace_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outpoint TEXT NOT NULL,           -- txid:vout
  sat_range_start TEXT NOT NULL,    -- first BHANG ordinal in this chunk
  sat_range_end TEXT NOT NULL,      -- last BHANG ordinal in this chunk
  depth INTEGER NOT NULL DEFAULT 0, -- hops from coinbase
  input_offset TEXT NOT NULL DEFAULT '0', -- position of tracked sats within the UTXO
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Dedup index: same outpoint+range should not be queued twice
CREATE INDEX idx_trace_queue_outpoint ON trace_queue(outpoint, sat_range_start, sat_range_end);
```

### utxos
```sql
CREATE TABLE utxos (
  outpoint TEXT NOT NULL,
  address TEXT NOT NULL,
  sat_range_start TEXT NOT NULL,
  sat_range_end TEXT NOT NULL,
  sat_count INTEGER NOT NULL,
  spent INTEGER NOT NULL DEFAULT 0,
  input_offset TEXT NOT NULL DEFAULT '0',
  last_moved TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_checked TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (outpoint, sat_range_start)  -- composite: same outpoint can hold multiple ranges
);
```

### trace_state
```sql
CREATE TABLE trace_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_traced_txid TEXT,
  last_traced_depth INTEGER NOT NULL DEFAULT 0,
  total_utxos_found INTEGER NOT NULL DEFAULT 0,
  fee_sats_retraced TEXT NOT NULL DEFAULT '0',
  last_run TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'idle'  -- idle|tracing|refreshing|paused|complete|error
);
```

---

## API Requirements

The tracer needs these Bitcoin data APIs:

1. **Get transaction** (txid → inputs, outputs with values/addresses, outspend status, block_height, fee)
2. **Get output spend status** (txid + vout → spent boolean + spending txid)
3. **Get block info** (height → hash, coinbase txid, timestamp)
4. **Get block transaction IDs** (height → ordered list of txids)
5. **Get block transactions page** (height + startIndex → 25 TXs with txid and fee)

Current implementation uses mempool.space public API with 350ms throttle between requests. Rate limiting (HTTP 429) is handled with backoff.

---

## Verification

After a complete trace, verify:

```
total_sats_in_utxos + total_sats_in_queue = 308,915,776
```

If the queue is empty and status is "complete":
```
total_sats_in_utxos = 308,915,776  (every sat accounted for)
```

Any gap means sats were lost during tracing (bug).

---

## Current State

- **Tech stack:** TypeScript, Next.js, better-sqlite3, mempool.space API
- **Project location:** `C:\Users\akhil\Main\Test Track`
- **DB file:** `./bhang-tracker.db`
- **Key files:**
  - `src/indexer/tracer.ts` — main tracing logic
  - `src/db/queries.ts` — database queries
  - `src/db/index.ts` — schema and migrations
  - `src/providers/public-provider.ts` — mempool.space API client
  - `src/providers/types.ts` — API interface
  - `src/core/series.ts` — BHANG series definitions
  - `src/core/sat-math.ts` — ordinal name ↔ sat number conversion
  - `scripts/index-sats.ts` — CLI entry point
  - `scripts/export-snapshot.ts` — exports DB to JSON for website
- **Website:** Static HTML at `C:\Users\akhil\Main\bhang.wtf`, pushed to GitHub Pages via scheduled task every 2 hours
- **GitHub:** https://github.com/bhangwtf/bhang

### Bug 6: Queue delete-before-ack (crash = permanent sat loss)

**Problem:** `dequeueTrace` deletes the item from the queue BEFORE processing begins. If the process crashes, network drops, or the machine shuts down mid-trace, the item is gone forever — those sats are permanently lost with no way to recover.

**Fix:** "Ack after success" pattern. Don't delete the queue item until processing completes successfully. Either:
- Use a `processing` flag (set on dequeue, delete on success, reset on restart)
- Or dequeue into a separate "in-flight" table, delete only on success

### Bug 7: API failure silently fakes "unspent"

**Problem:** The `getOutputSpend` method catches all errors and returns `{ spent: false }`:
```typescript
} catch {
  return { spent: false };
}
```
If the API call fails (network error, timeout, rate limit), the tracer records the output as an **unspent UTXO** — when it might actually be spent. This means sats get frozen at incorrect intermediate UTXOs instead of being traced further. The tracer thinks it found the final location, but it's wrong.

**Fix:** Make spend-check failures fatal. Throw the error so the queue item gets retried. Never guess "unspent" on API failure.

### Bug 8: No conservation verification at completion

**Problem:** The tracer marks itself "complete" without verifying that all 308,915,776 sats are accounted for. It can finish with a massive gap and happily report success.

**Fix:** Before setting status to "complete", compute `SUM(sat_count) FROM utxos` and assert it equals 308,915,776. If not, refuse to complete and report the gap. This is the ultimate safety net — if any bug slips through, the conservation check catches it.

---

## Summary of Requirements

1. Start from coinbase outputs of blocks 579,124 and 579,125
2. Track exactly 308,915,776 sats (BHANG ordinal range subset of subsidy)
3. Follow every sat through every transfer using FIFO with correct input offsets
4. When sats become transaction fees, trace them to the confirming block's coinbase
5. Handle sats becoming fees multiple times (recursive)
6. Handle multiple BHANG sat ranges converging on the same UTXO
7. Handle network errors gracefully (retry without losing sats)
8. At completion: every sat must be in a recorded UTXO, zero gap
9. Resumable: can stop and restart without losing progress (ack-after-success queue)
10. Store fee_sats_retraced counter for transparency
11. Never guess "unspent" on API failure — retry or fail, never fake data
12. Conservation check at completion: refuse to mark complete unless total sats = 308,915,776
13. Crash-safe: no operation should permanently lose sats if interrupted mid-execution
