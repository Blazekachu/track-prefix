import type Database from "better-sqlite3";
import type { OrdProvider } from "@/providers/types";
import { getUtxosBySeries, upsertInscription } from "@/db/queries";
import { SERIES } from "@/core/series";

export class InscriptionScanner {
  private db: Database.Database;
  private provider: OrdProvider;

  constructor(db: Database.Database, provider: OrdProvider) {
    this.db = db;
    this.provider = provider;
  }

  async scanSeries(seriesId: number, sampleSize = 10): Promise<number> {
    const utxos = getUtxosBySeries(this.db, seriesId);
    let found = 0;

    console.log(`[scanner] Scanning ${utxos.length} UTXOs for series ${seriesId} inscriptions...`);

    for (const utxo of utxos) {
      if (utxo.spent) continue;

      const start = BigInt(utxo.sat_range_start);
      const end = BigInt(utxo.sat_range_end);
      const rangeSize = end - start + 1n;

      const satsToCheck: bigint[] = [start, end];
      for (let i = 0; i < sampleSize - 2 && i < Number(rangeSize) - 2; i++) {
        const offset = BigInt(Math.floor(Math.random() * Number(rangeSize)));
        satsToCheck.push(start + offset);
      }

      const unique = [...new Set(satsToCheck.map(String))];

      for (const satStr of unique) {
        try {
          const info = await this.provider.getSat(satStr);
          if (info.inscriptions && info.inscriptions.length > 0) {
            for (const inscId of info.inscriptions) {
              upsertInscription(this.db, {
                sat_number: satStr,
                inscription_id: inscId,
                content_type: null,
                utxo_outpoint: utxo.outpoint,
              });
              found++;
              console.log(`[scanner] Inscription found: ${inscId} on sat ${satStr}`);
            }
          }
        } catch (err) {
          console.warn(`[scanner] Error checking sat ${satStr}: ${err}`);
        }
      }
    }

    console.log(`[scanner] Scan complete. Found ${found} inscriptions.`);
    return found;
  }
}
