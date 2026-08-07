import { nameToSat, satToName } from "./sat-math";

export interface SeriesRange {
  /** 1 = 11-letter names; equals 12 - nameLength. */
  id: number;
  nameLength: number;
  satStartName: string;
  satEndName: string;
  satStart: bigint;
  satEnd: bigint;
  satCount: bigint;
  clamped: boolean;
}

/**
 * Enumerate every series for a prefix, from 11-letter names down to the prefix
 * itself. Series fully beyond supply are dropped. Supply straddles keep the
 * in-supply portion only.
 */
export function buildSeriesRanges(prefix: string): SeriesRange[] {
  const result: SeriesRange[] = [];
  for (let nameLength = 11; nameLength >= prefix.length; nameLength--) {
    const suffixLen = nameLength - prefix.length;
    const satEndName = prefix + "a".repeat(suffixLen);
    let satStartName = prefix + "z".repeat(suffixLen);

    const satEnd = nameToSat(satEndName);
    let satStart = nameToSat(satStartName);
    let clamped = false;

    if (satEnd < 0n) continue;
    if (satStart < 0n) {
      satStart = 0n;
      satStartName = satToName(satStart);
      clamped = true;
    }

    result.push({
      id: 12 - nameLength,
      nameLength,
      satStartName,
      satEndName,
      satStart,
      satEnd,
      satCount: satEnd - satStart + 1n,
      clamped,
    });
  }
  return result;
}
