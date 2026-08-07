import type Database from "better-sqlite3";
import type { OrdProvider } from "@/providers/types";
import type { SatRange } from "./fifo";
import {
  upsertUtxo,
  markUtxoSpent,
  updateUtxoLastMoved,
  updateTraceState,
  enqueueTrace,
  peekTrace,
  deleteTrace,
  getQueueSize,
  getUnspentUtxos,
  getTraceState,
  getTraceAccounting,
  getTraceGaps,
  deleteQueuedRangesCoveredByLiveUtxos,
} from "@/db/queries";

export type TracerMode = "trace" | "refresh" | "repair";

export class CoinbaseTracer {
  private db: Database.Database;
  private provider: OrdProvider;
  private utxosFound = 0;
  private feeSatsRetraced = 0n;
  private visited = new Set<string>();
  private blockTxidsCache = new Map<number, string[]>();
  private targetRange: SatRange;
  private originHeights: number[];
  private seriesId: number;

  constructor(
    db: Database.Database,
    provider: OrdProvider,
    targetRange: SatRange,
    originHeights: number[],
    seriesId: number = 1
  ) {
    this.db = db;
    this.provider = provider;
    this.targetRange = targetRange;
    this.originHeights = originHeights;
    this.seriesId = seriesId;
  }

  /**
   * Main entry point. Supports two modes:
   *
   * "trace"   — Initial discovery. Seeds the queue from coinbase TXs if empty,
   *             then processes queue items. Resumes from where it left off.
   *
   * "refresh" — Re-checks all live (unspent) UTXOs. If any have been spent,
   *             marks them spent and queues their spending TXs for tracing.
   *             Then processes the queue to find new UTXOs.
   */
  async run(mode: TracerMode = "trace"): Promise<void> {
    const state = getTraceState(this.db);
    this.utxosFound = state?.total_utxos_found ?? 0;
    this.feeSatsRetraced = BigInt(state?.fee_sats_retraced ?? "0");

    if (mode === "repair") {
      await this.repairMissingCoverage();
      this.cleanupCoveredQueueRows();
      const accounting = getTraceAccounting(this.db, this.seriesId);
      updateTraceState(this.db, {
        last_traced_txid: null,
        last_traced_depth: 0,
        total_utxos_found: this.utxosFound,
        fee_sats_retraced: this.feeSatsRetraced.toString(),
        status: accounting.gap_sats === 0n && accounting.duplicate_sats === 0n ? "tracing" : "error",
      });
      return;
    }

    if (mode === "refresh") {
      await this.refresh();
    } else {
      await this.seedIfNeeded();
    }

    // Process the queue
    await this.processQueue();
  }

  /**
   * Seed the trace queue from coinbase TXs if queue is empty
   * and we haven't completed a full trace before.
   */
  private async seedIfNeeded(): Promise<void> {
    const state = getTraceState(this.db);

    await this.repairMissingCoverage();
    this.cleanupCoveredQueueRows();
    const queueSize = getQueueSize(this.db);

    // If queue has items, we're resuming after repairing any missing origin gaps.
    if (queueSize > 0) {
      console.log(`[tracer] Resuming — ${queueSize} items in queue`);
      return;
    }

    // If we already completed a trace, don't re-seed (use refresh mode instead)
    if (state?.status === "complete") {
      console.log(`[tracer] Previous trace complete. Use refresh mode to check for movements.`);
      return;
    }

    console.log(`[tracer] Seeding queue from coinbase TXs...`);

    await this.seedRangeFromCoinbase(this.targetRange);

    const seeded = getQueueSize(this.db);
    console.log(`[tracer] Seeded ${seeded} items into queue`);
  }

  private async repairMissingCoverage(): Promise<void> {
    const gaps = getTraceGaps(this.db, this.seriesId);
    if (gaps.length === 0) return;

    const missing = gaps.reduce((sum, gap) => sum + gap.count, 0n);
    console.warn(
      `[tracer] Found ${gaps.length} missing coverage gap(s), reseeding ${missing.toLocaleString("en-US")} sats from coinbase origins...`
    );

    for (const gap of gaps) {
      console.warn(`[tracer] Reseed gap ${gap.start}-${gap.end} (${gap.count.toLocaleString("en-US")} sats)`);
      await this.seedRangeFromCoinbase({ start: gap.start, end: gap.end });
    }
  }

  private cleanupCoveredQueueRows(): void {
    const deleted = deleteQueuedRangesCoveredByLiveUtxos(this.db, this.seriesId);
    if (deleted > 0) {
      console.warn(`[tracer] Removed ${deleted} queued range(s) already covered by live UTXOs`);
    }
  }

  private async seedRangeFromCoinbase(targetRange: SatRange): Promise<void> {
    for (const blockHeight of this.originHeights) {
      const block = await this.provider.getBlock(blockHeight);
      const coinbaseTxid = block.coinbase_txid;

      console.log(`[tracer] Block ${blockHeight} coinbase: ${coinbaseTxid}`);

      const tx = await this.provider.getTransaction(coinbaseTxid);

      // IMPORTANT: Only subsidy sats are new contiguous ordinals.
      // Fee sats in the coinbase are existing sats with their own ordinals.
      const firstSat = this.computeBlockFirstSat(BigInt(blockHeight));
      const subsidy = this.computeBlockSubsidy(BigInt(blockHeight));
      const subsidyRange: SatRange = {
        start: firstSat,
        end: firstSat + subsidy - 1n,
      };

      console.log(`[tracer] Block ${blockHeight} subsidy range: ${subsidyRange.start}-${subsidyRange.end} (${subsidy} sats)`);

      const overlapStart = targetRange.start > subsidyRange.start ? targetRange.start : subsidyRange.start;
      const overlapEnd = targetRange.end < subsidyRange.end ? targetRange.end : subsidyRange.end;

      if (overlapStart > overlapEnd) continue;

      console.log(`[tracer] Block ${blockHeight} overlap: ${overlapEnd - overlapStart + 1n} sats`);
      let blockMapped = 0n;

      // Map subsidy sats to coinbase outputs using FIFO.
      // Subsidy sats fill outputs first, then fee sats fill the rest.
      let subsidyRemaining = subsidy;
      let offset = firstSat;
      for (let vout = 0; vout < tx.outputs.length; vout++) {
        if (subsidyRemaining <= 0n) break;

        const outValue = BigInt(tx.outputs[vout].value);
        // This output gets min(outValue, subsidyRemaining) subsidy sats
        const subsidyInOutput = outValue < subsidyRemaining ? outValue : subsidyRemaining;
        const outStart = offset;
        const outEnd = offset + subsidyInOutput - 1n;
        offset += subsidyInOutput;
        subsidyRemaining -= subsidyInOutput;

        // Intersect with target range
        const oStart = targetRange.start > outStart ? targetRange.start : outStart;
        const oEnd = targetRange.end < outEnd ? targetRange.end : outEnd;
        if (oStart > oEnd) continue;
        blockMapped += oEnd - oStart + 1n;

        // Position of tracked sats within this output
        const inputOffset = oStart - outStart;

        if (tx.outputs[vout].spent && tx.outputs[vout].spending_txid) {
          // Queue for tracing
          const inserted = enqueueTrace(
            this.db,
            `${coinbaseTxid}:${vout}`,
            oStart.toString(),
            oEnd.toString(),
            0,
            inputOffset.toString()
          );
          console.log(
            `[tracer] Seed ${inserted ? "queued" : "already queued"} ${coinbaseTxid}:${vout} ` +
            `${oStart}-${oEnd} (${(oEnd - oStart + 1n).toLocaleString("en-US")} sats)`
          );
        } else {
          // Unspent — record directly
          this.recordUtxo(
            coinbaseTxid, vout,
            tx.outputs[vout].address,
            { start: oStart, end: oEnd },
            block.timestamp,
            inputOffset
          );
        }
      }

      const expectedBlockMapped = overlapEnd - overlapStart + 1n;
      if (blockMapped !== expectedBlockMapped) {
        throw new Error(
          `Seed mapped ${blockMapped} of ${expectedBlockMapped} sats for block ${blockHeight}; refusing to start with a gap`
        );
      }
    }
  }

  /**
   * Refresh mode — re-check all live UTXOs for movements.
   */
  private async refresh(): Promise<void> {
    console.log(`[tracer] Refresh mode — checking live UTXOs for movements...`);

    updateTraceState(this.db, {
      last_traced_txid: null,
      last_traced_depth: 0,
      total_utxos_found: 0,
      fee_sats_retraced: "0",
      status: "refreshing",
    });

    const liveUtxos = getUnspentUtxos(this.db, 1);
    console.log(`[tracer] Checking ${liveUtxos.length} live UTXOs...`);

    let moved = 0;
    let backfilled = 0;
    for (const utxo of liveUtxos) {
      const [txid, voutStr] = utxo.outpoint.split(":");
      const vout = parseInt(voutStr, 10);

      try {
        const spendInfo = await this.provider.getOutputSpend(txid, vout);
        if (spendInfo.spent && spendInfo.spending_txid) {
          console.log(`[tracer] Movement detected: ${utxo.outpoint} was spent!`);
          markUtxoSpent(this.db, utxo.outpoint);
          moved++;

          // Queue the spending TX for tracing to find new destination
          enqueueTrace(
            this.db,
            utxo.outpoint,
            utxo.sat_range_start,
            utxo.sat_range_end,
            0,
            utxo.input_offset
          );
        } else if (!utxo.last_moved) {
          // Backfill: this UTXO was recorded while its tx was still in the
          // mempool, so it has no block time. Fill it once the tx confirms.
          const tx = await this.provider.getTransaction(txid);
          if (tx.block_time) {
            const lastMoved = new Date(tx.block_time * 1000)
              .toISOString().replace("T", " ").substring(0, 19);
            updateUtxoLastMoved(this.db, utxo.outpoint, utxo.sat_range_start, lastMoved);
            backfilled++;
            console.log(`[tracer] Backfilled last_moved for ${utxo.outpoint}: ${lastMoved}`);
          }
        }
      } catch (err) {
        console.warn(`[tracer] Error checking ${utxo.outpoint}: ${err}`);
      }
    }

    console.log(`[tracer] Refresh: ${moved} UTXOs moved, ${backfilled} timestamp(s) backfilled, ${liveUtxos.length - moved} unchanged`);
  }

  /**
   * Process the trace queue item by item. Each item is one outpoint
   * whose spending TX we need to fetch and trace forward.
   */
  private async processQueue(): Promise<void> {
    let queueSize = getQueueSize(this.db);
    if (queueSize === 0) {
      console.log(`[tracer] Queue empty — nothing to trace`);
      const accounting = getTraceAccounting(this.db, this.seriesId);
      const complete = accounting.gap_sats === 0n && accounting.duplicate_sats === 0n;
      updateTraceState(this.db, {
        last_traced_txid: null,
        last_traced_depth: 0,
        total_utxos_found: this.utxosFound,
        fee_sats_retraced: this.feeSatsRetraced.toString(),
        status: complete ? "complete" : "error",
      });
      if (!complete) {
        throw new Error(
          `Trace accounting mismatch: live=${accounting.live_sats}, queued=${accounting.queued_sats}, ` +
          `unique=${accounting.accounted_sats}, duplicate=${accounting.duplicate_sats}, ` +
          `target=${accounting.target_sats}, gap=${accounting.gap_sats}`
        );
      }
      return;
    }

    console.log(`[tracer] Processing queue (${queueSize} items)...`);

    updateTraceState(this.db, {
      last_traced_txid: null,
      last_traced_depth: 0,
      total_utxos_found: this.utxosFound,
      fee_sats_retraced: this.feeSatsRetraced.toString(),
      status: "tracing",
    });

    let processed = 0;

    while (true) {
      this.cleanupCoveredQueueRows();
      const item = peekTrace(this.db);
      if (!item) break;

      const [prevTxid, prevVoutStr] = item.outpoint.split(":");
      const prevVout = parseInt(prevVoutStr, 10);
      const trackedRange: SatRange = {
        start: BigInt(item.sat_range_start),
        end: BigInt(item.sat_range_end),
      };

      // Skip if already successfully processed this exact outpoint+range
      const visitKey = `${item.outpoint}:${item.sat_range_start}-${item.sat_range_end}`;
      if (this.visited.has(visitKey)) {
        deleteTrace(this.db, item.id);
        continue;
      }

      try {
        // Check if this output was spent
        const spendInfo = await this.provider.getOutputSpend(prevTxid, prevVout);

        if (!spendInfo.spent || !spendInfo.spending_txid) {
          // Unspent — this is a live UTXO
          const prevTx = await this.provider.getTransaction(prevTxid);
          this.recordUtxo(
            prevTxid, prevVout,
            prevTx.outputs[prevVout].address,
            trackedRange,
            prevTx.block_time,
            BigInt(item.input_offset)
          );
        } else {
          // Spent — fetch spending TX and trace outputs
          const spendingTx = await this.provider.getTransaction(spendInfo.spending_txid);
          markUtxoSpent(this.db, item.outpoint);

          const inputIndex = spendingTx.inputs.findIndex(
            (inp) => inp.txid === prevTxid && inp.vout === prevVout
          );

          if (inputIndex === -1) {
            throw new Error(`Could not find input spending ${item.outpoint} in ${spendInfo.spending_txid}`);
          }

          // FIFO: position of this input in the concatenated input stream
          const streamOffset = spendingTx.inputs
            .slice(0, inputIndex)
            .reduce((sum, inp) => sum + BigInt(inp.value), 0n);

          // Correct position: account for offset of tracked sats within the input
          const inputOffset = BigInt(item.input_offset);
          const streamPosition = streamOffset + inputOffset;
          const rangeSize = trackedRange.end - trackedRange.start + 1n;

          // Map tracked sats to outputs using FIFO
          let mappedCount = 0n;
          let outOffset = 0n;
          for (let vout = 0; vout < spendingTx.outputs.length; vout++) {
            const outSize = BigInt(spendingTx.outputs[vout].value);
            const outStart = outOffset;
            const outEnd = outOffset + outSize - 1n;
            outOffset += outSize;

            const intStart = streamPosition > outStart ? streamPosition : outStart;
            const intEnd = (streamPosition + rangeSize - 1n) < outEnd
              ? (streamPosition + rangeSize - 1n)
              : outEnd;

            if (intStart > intEnd) continue;

            // Offset of tracked sats within this new output
            const newInputOffset = intStart - outStart;
            const satStart = trackedRange.start + (intStart - streamPosition);
            const satEnd = trackedRange.start + (intEnd - streamPosition);
            mappedCount += satEnd - satStart + 1n;

            const outpoint = `${spendInfo.spending_txid}:${vout}`;

            if (spendingTx.outputs[vout].spent && spendingTx.outputs[vout].spending_txid) {
              // Queue for further tracing
              enqueueTrace(
                this.db,
                outpoint,
                satStart.toString(),
                satEnd.toString(),
                item.depth + 1,
                newInputOffset.toString()
              );
            } else {
              // Unspent — record UTXO
              this.recordUtxo(
                spendInfo.spending_txid,
                vout,
                spendingTx.outputs[vout].address,
                { start: satStart, end: satEnd },
                spendingTx.block_time,
                newInputOffset
              );
            }
          }

          // Fee sats: tracked sats beyond total output value go to the miner's coinbase
          const totalOutputValue = outOffset;
          if (streamPosition + rangeSize > totalOutputValue && spendingTx.fee > 0) {
            const feePortionStart = totalOutputValue > streamPosition
              ? totalOutputValue
              : streamPosition;
            const feeInternalStart = feePortionStart - totalOutputValue;
            const feeInternalEnd = (streamPosition + rangeSize - 1n) - totalOutputValue;

            const trackedFeeStart = trackedRange.start + (feePortionStart - streamPosition);
            const trackedFeeEnd = trackedRange.end;
            mappedCount += trackedFeeEnd - trackedFeeStart + 1n;

            await this.traceFeeToCoinbase(
              spendInfo.spending_txid,
              spendingTx.block_height,
              feeInternalStart,
              feeInternalEnd,
              trackedFeeStart,
              trackedFeeEnd,
              item.depth
            );
            this.feeSatsRetraced += trackedFeeEnd - trackedFeeStart + 1n;
          }

          if (mappedCount !== rangeSize) {
            throw new Error(
              `Mapped ${mappedCount} of ${rangeSize} sats for ${item.outpoint}; refusing to drop sats`
            );
          }
        }

        // Mark as visited only after successful processing
        this.visited.add(visitKey);
        deleteTrace(this.db, item.id);
        processed++;

        // Update state periodically
        if (processed % 10 === 0) {
          const remaining = getQueueSize(this.db);
          updateTraceState(this.db, {
            last_traced_txid: prevTxid,
            last_traced_depth: item.depth,
            total_utxos_found: this.utxosFound,
            fee_sats_retraced: this.feeSatsRetraced.toString(),
            status: "tracing",
          });
          console.log(`[tracer] Progress: ${processed} processed, ${remaining} in queue, ${this.utxosFound} UTXOs found | Fee sats retraced: ${this.feeSatsRetraced.toLocaleString("en-US")}`);
        }
      } catch (err) {
        // Leave the item in the queue. It has not been acknowledged, so a rerun
        // retries the exact same sat range instead of silently losing it.
        console.error(`[tracer] Error tracing ${item.outpoint}: ${err}`);
        updateTraceState(this.db, {
          last_traced_txid: prevTxid,
          last_traced_depth: item.depth,
          total_utxos_found: this.utxosFound,
          fee_sats_retraced: this.feeSatsRetraced.toString(),
          status: "error",
        });
        throw err;
      }
    }

    const accounting = getTraceAccounting(this.db, this.seriesId);
    if (accounting.gap_sats !== 0n || accounting.duplicate_sats !== 0n) {
      updateTraceState(this.db, {
        last_traced_txid: null,
        last_traced_depth: 0,
        total_utxos_found: this.utxosFound,
        fee_sats_retraced: this.feeSatsRetraced.toString(),
        status: "error",
      });
      throw new Error(
        `Trace accounting mismatch: live=${accounting.live_sats}, queued=${accounting.queued_sats}, ` +
        `unique=${accounting.accounted_sats}, duplicate=${accounting.duplicate_sats}, ` +
        `target=${accounting.target_sats}, gap=${accounting.gap_sats}`
      );
    }

    updateTraceState(this.db, {
      last_traced_txid: null,
      last_traced_depth: 0,
      total_utxos_found: this.utxosFound,
      fee_sats_retraced: this.feeSatsRetraced.toString(),
      status: "complete",
    });

    console.log(`[tracer] Complete. Processed ${processed} items, found ${this.utxosFound} UTXOs. Fee sats retraced: ${this.feeSatsRetraced.toLocaleString("en-US")}`);
  }

  /**
   * Trace fee sats to the coinbase TX of the block that confirmed the spending TX.
   *
   * In ordinal theory, fee sats go to the coinbase in transaction-index order:
   * subsidy sats first, then fees from TX[1], TX[2], etc.
   */
  private async traceFeeToCoinbase(
    spendingTxid: string,
    blockHeight: number,
    feeInternalStart: bigint,
    feeInternalEnd: bigint,
    trackedSatStart: bigint,
    trackedSatEnd: bigint,
    depth: number
  ): Promise<void> {
    const feeSatCount = trackedSatEnd - trackedSatStart + 1n;
    console.log(
      `[tracer] Fee sats: ${feeSatCount} sats from ${spendingTxid.substring(0, 16)}... → block ${blockHeight} coinbase`
    );

    // 1. Get block txids (cached)
    const txids = await this.getBlockTxidsCached(blockHeight);
    const txIndex = txids.indexOf(spendingTxid);
    if (txIndex <= 0) {
      throw new Error(`Could not find TX ${spendingTxid} in block ${blockHeight}`);
    }

    // 2. Compute cumulative fees of all TXs before this one (skip coinbase at index 0)
    let cumulativeFee = 0n;
    const pageSize = 25;
    for (let start = 0; start < txIndex; start += pageSize) {
      const page = await this.provider.getBlockTxsPage(blockHeight, start);
      for (let i = 0; i < page.length && (start + i) < txIndex; i++) {
        if (start + i > 0) {
          cumulativeFee += BigInt(page[i].fee);
        }
      }
    }

    // 3. Position in coinbase: subsidy + prior fees + internal offset
    const subsidy = this.computeBlockSubsidy(BigInt(blockHeight));
    const coinbaseStart = subsidy + cumulativeFee + feeInternalStart;
    const coinbaseEnd = subsidy + cumulativeFee + feeInternalEnd;

    // 4. Fetch coinbase TX and map fee sats to its outputs
    const coinbaseTxid = txids[0];
    const coinbaseTx = await this.provider.getTransaction(coinbaseTxid);

    let mappedCount = 0n;
    let outOffset = 0n;
    for (let vout = 0; vout < coinbaseTx.outputs.length; vout++) {
      const outSize = BigInt(coinbaseTx.outputs[vout].value);
      const outStart = outOffset;
      const outEnd = outOffset + outSize - 1n;
      outOffset += outSize;

      const intStart = coinbaseStart > outStart ? coinbaseStart : outStart;
      const intEnd = coinbaseEnd < outEnd ? coinbaseEnd : outEnd;

      if (intStart > intEnd) continue;

      const newInputOffset = intStart - outStart;
      const satStart = trackedSatStart + (intStart - coinbaseStart);
      const satEnd = trackedSatStart + (intEnd - coinbaseStart);
      mappedCount += satEnd - satStart + 1n;

      const outpoint = `${coinbaseTxid}:${vout}`;

      if (coinbaseTx.outputs[vout].spent && coinbaseTx.outputs[vout].spending_txid) {
        const inserted = enqueueTrace(
          this.db,
          outpoint,
          satStart.toString(),
          satEnd.toString(),
          depth + 1,
          newInputOffset.toString()
        );
        console.log(
          `[tracer] Fee ${inserted ? "queued" : "already queued"} ${outpoint} ` +
          `${satStart}-${satEnd} (${(satEnd - satStart + 1n).toLocaleString("en-US")} sats)`
        );
      } else {
        this.recordUtxo(
          coinbaseTxid, vout,
          coinbaseTx.outputs[vout].address,
          { start: satStart, end: satEnd },
          coinbaseTx.block_time,
          newInputOffset
        );
      }
    }

    if (mappedCount !== feeSatCount) {
      throw new Error(
        `Mapped ${mappedCount} of ${feeSatCount} fee sats into coinbase ${coinbaseTxid}; refusing to drop sats`
      );
    }
  }

  private async getBlockTxidsCached(blockHeight: number): Promise<string[]> {
    if (!this.blockTxidsCache.has(blockHeight)) {
      const txids = await this.provider.getBlockTxids(blockHeight);
      this.blockTxidsCache.set(blockHeight, txids);
    }
    return this.blockTxidsCache.get(blockHeight)!;
  }

  private recordUtxo(
    txid: string, vout: number, address: string,
    range: SatRange, blockTime?: number, inputOffset?: bigint
  ): void {
    const outpoint = `${txid}:${vout}`;
    const satCount = Number(range.end - range.start + 1n);

    const lastMoved = blockTime
      ? new Date(blockTime * 1000).toISOString().replace("T", " ").substring(0, 19)
      : null;

    upsertUtxo(this.db, {
      outpoint,
      address,
      sat_range_start: range.start.toString(),
      sat_range_end: range.end.toString(),
      sat_count: satCount,
      spent: false,
      input_offset: (inputOffset ?? 0n).toString(),
      last_moved: lastMoved,
    });

    this.utxosFound++;
    console.log(`[tracer] UTXO: ${outpoint} — ${address.substring(0, 20)}... — ${satCount.toLocaleString("en-US")} sats — ${lastMoved ?? "unknown"}`);
  }

  private computeBlockFirstSat(height: bigint): bigint {
    let sat = 0n;
    let subsidy = 5_000_000_000n;
    let h = 0n;

    for (let epoch = 0; epoch < 64; epoch++) {
      const epochEnd = h + 210_000n;
      if (height < epochEnd) {
        sat += (height - h) * subsidy;
        return sat;
      }
      sat += 210_000n * subsidy;
      h = epochEnd;
      subsidy /= 2n;
    }

    return sat;
  }

  private computeBlockSubsidy(height: bigint): bigint {
    let subsidy = 5_000_000_000n;
    const epoch = height / 210_000n;
    for (let i = 0n; i < epoch; i++) {
      subsidy /= 2n;
    }
    return subsidy;
  }
}
