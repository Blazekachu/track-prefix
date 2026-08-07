import type Database from "better-sqlite3";
import type { OrdProvider } from "@/providers/types";
import {
  getUtxosBySeries,
  upsertInscription,
  getScanState,
  updateScanState,
  countInscriptions,
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

/**
 * Sample sats inside each live UTXO and query the provider for inscriptions.
 * Cooperative pause/stop via .scan.control. Resumes after last_outpoint.
 */
export class InscriptionScanner {
  private db: Database.Database;
  private provider: OrdProvider;

  constructor(db: Database.Database, provider: OrdProvider) {
    this.db = db;
    this.provider = provider;
  }

  async scanSeries(seriesId: number, sampleSize = 10): Promise<number> {
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
    });

    console.log(
      `[scanner] Scanning ${live.length} live UTXOs for series ${seriesId}` +
        (resumeAfter ? ` (resume after ${resumeAfter})` : "")
    );

    for (let i = utxosDone; i < live.length; i++) {
      const control = readScanControl();
      if (control === "pause") {
        updateScanState(this.db, {
          status: "paused",
          utxos_total: live.length,
          utxos_done: i,
          sats_checked: satsChecked,
          inscriptions_found: countInscriptions(this.db),
          last_outpoint: i > 0 ? live[i - 1].outpoint : resumeAfter,
        });
        throw new ScanPausedError();
      }
      if (control === "stop") {
        updateScanState(this.db, {
          status: "paused",
          utxos_total: live.length,
          utxos_done: i,
          sats_checked: satsChecked,
          inscriptions_found: countInscriptions(this.db),
          last_outpoint: i > 0 ? live[i - 1].outpoint : resumeAfter,
        });
        throw new ScanStoppedError();
      }

      const utxo = live[i];
      const start = BigInt(utxo.sat_range_start);
      const end = BigInt(utxo.sat_range_end);
      const rangeSize = end - start + 1n;

      const satsToCheck: bigint[] = [start, end];
      const extra = Math.max(0, sampleSize - 2);
      for (let s = 0; s < extra && s < Number(rangeSize) - 2; s++) {
        const offset = BigInt(Math.floor(Math.random() * Number(rangeSize)));
        satsToCheck.push(start + offset);
      }
      const unique = [...new Set(satsToCheck.map(String))];

      for (const satStr of unique) {
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
                `[scanner] Inscription found: ${inscId} on sat ${satStr}`
              );
            }
          }
        } catch (err) {
          console.warn(`[scanner] Error checking sat ${satStr}: ${err}`);
        }
      }

      updateScanState(this.db, {
        status: "scanning",
        utxos_total: live.length,
        utxos_done: i + 1,
        sats_checked: satsChecked,
        inscriptions_found: countInscriptions(this.db),
        last_outpoint: utxo.outpoint,
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
    });

    console.log(
      `[scanner] Scan complete. ${total} inscriptions in DB (+${total - inscriptionsAtStart} this run, ${foundDelta} upsert events).`
    );
    return total;
  }
}
