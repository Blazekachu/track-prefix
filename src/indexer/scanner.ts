import type Database from "better-sqlite3";
import type { OrdProvider } from "@/providers/types";
import {
  getUtxosBySeries,
  upsertInscription,
  getScanState,
  updateScanState,
  countInscriptions,
  type UtxoRow,
} from "@/db/queries";
import { readScanControl } from "@/core/scan-control";

export class ScanPausedError extends Error {
  constructor() {
    super("Inscription scan paused");
    this.name = "ScanPausedError";
  }
}

export class ScanStoppedError extends Error {
  constructor() {
    super("Inscription scan stopped");
    this.name = "ScanStoppedError";
  }
}

export type InscriptionScanMode = "first_sat" | "every_sat";

/** First sat of the on-chain outpoint (offset 0), not merely the tracked slice start. */
export function firstSatOfUtxo(utxo: UtxoRow): bigint {
  const rangeStart = BigInt(utxo.sat_range_start);
  const offset = BigInt(utxo.input_offset || "0");
  const first = rangeStart - offset;
  return first < 0n ? 0n : first;
}

function satsForUtxo(utxo: UtxoRow, mode: InscriptionScanMode): bigint[] {
  if (mode === "first_sat") {
    return [firstSatOfUtxo(utxo)];
  }
  const start = BigInt(utxo.sat_range_start);
  const end = BigInt(utxo.sat_range_end);
  const out: bigint[] = [];
  // Include true first sat of outpoint if outside tracked slice
  const first = firstSatOfUtxo(utxo);
  if (first < start || first > end) out.push(first);
  for (let s = start; s <= end; s++) {
    out.push(s);
  }
  return out;
}

/**
 * Inscription scan over live UTXOs.
 * - first_sat: 1 lookup per UTXO (first sat of the outpoint) — default for all modes
 * - every_sat: every sat in each UTXO's tracked range (+ outpoint first sat) — btc_ord only
 */
export class InscriptionScanner {
  private db: Database.Database;
  private provider: OrdProvider;

  constructor(db: Database.Database, provider: OrdProvider) {
    this.db = db;
    this.provider = provider;
  }

  async scanSeries(
    seriesId: number,
    mode: InscriptionScanMode = "first_sat"
  ): Promise<number> {
    const live = getUtxosBySeries(this.db, seriesId).filter((u) => !u.spent);
    live.sort((a, b) => a.outpoint.localeCompare(b.outpoint));

    const prior = getScanState(this.db);
    const resumeAfter =
      prior?.status === "paused" && prior.last_outpoint
        ? prior.last_outpoint
        : null;

    let utxosDone = 0;
    let satsChecked = prior?.status === "paused" ? prior.sats_checked : 0;
    let foundDelta = 0;
    const inscriptionsAtStart = countInscriptions(this.db);

    if (resumeAfter) {
      const idx = live.findIndex((u) => u.outpoint === resumeAfter);
      utxosDone = idx >= 0 ? idx + 1 : 0;
    }

    updateScanState(this.db, {
      status: "scanning",
      utxos_total: live.length,
      utxos_done: utxosDone,
      sats_checked: satsChecked,
      inscriptions_found: countInscriptions(this.db),
      last_outpoint: resumeAfter,
      scan_mode: mode,
    });

    console.log(
      `[scanner] mode=${mode} — ${live.length} live UTXOs for series ${seriesId}` +
        (resumeAfter ? ` (resume after ${resumeAfter})` : "")
    );

    for (let i = utxosDone; i < live.length; i++) {
      const control = readScanControl();
      if (control === "pause" || control === "stop") {
        updateScanState(this.db, {
          status: "paused",
          utxos_total: live.length,
          utxos_done: i,
          sats_checked: satsChecked,
          inscriptions_found: countInscriptions(this.db),
          last_outpoint: i > 0 ? live[i - 1].outpoint : resumeAfter,
          scan_mode: mode,
        });
        if (control === "stop") throw new ScanStoppedError();
        throw new ScanPausedError();
      }

      const utxo = live[i];
      const satsToCheck = satsForUtxo(utxo, mode);

      for (const sat of satsToCheck) {
        const satStr = sat.toString();
        try {
          const info = await this.provider.getSat(satStr);
          satsChecked++;
          if (info.inscriptions && info.inscriptions.length > 0) {
            for (const inscId of info.inscriptions) {
              upsertInscription(this.db, {
                sat_number: satStr,
                inscription_id: inscId,
                content_type: null,
                utxo_outpoint: utxo.outpoint,
              });
              foundDelta++;
              console.log(
                `[scanner] Inscription found: ${inscId} on sat ${satStr} (${utxo.outpoint})`
              );
            }
          }
        } catch (err) {
          console.warn(`[scanner] Error checking sat ${satStr}: ${err}`);
        }

        if (mode === "every_sat") {
          const c = readScanControl();
          if (c === "pause" || c === "stop") {
            updateScanState(this.db, {
              status: "paused",
              utxos_total: live.length,
              utxos_done: i,
              sats_checked: satsChecked,
              inscriptions_found: countInscriptions(this.db),
              last_outpoint: i > 0 ? live[i - 1].outpoint : resumeAfter,
              scan_mode: mode,
            });
            if (c === "stop") throw new ScanStoppedError();
            throw new ScanPausedError();
          }
        }
      }

      updateScanState(this.db, {
        status: "scanning",
        utxos_total: live.length,
        utxos_done: i + 1,
        sats_checked: satsChecked,
        inscriptions_found: countInscriptions(this.db),
        last_outpoint: utxo.outpoint,
        scan_mode: mode,
      });

      if ((i + 1) % 5 === 0 || i + 1 === live.length) {
        console.log(
          `[scanner] Progress: ${i + 1}/${live.length} UTXOs, ${satsChecked} sats checked, ${countInscriptions(this.db)} inscriptions`
        );
      }
    }

    const total = countInscriptions(this.db);
    updateScanState(this.db, {
      status: "complete",
      utxos_total: live.length,
      utxos_done: live.length,
      sats_checked: satsChecked,
      inscriptions_found: total,
      last_outpoint: live.length ? live[live.length - 1].outpoint : null,
      scan_mode: mode,
    });

    console.log(
      `[scanner] Scan complete (${mode}). ${total} inscriptions in DB (+${total - inscriptionsAtStart} this run, ${foundDelta} upsert events).`
    );
    return total;
  }
}
