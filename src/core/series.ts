import { nameToSat } from "./sat-math";

export interface Series {
  id: number;
  nameLength: number;
  satStart: bigint;
  satEnd: bigint;
  satCount: bigint;
  targetBlock: bigint;
  estimatedYear: string;
  mined: boolean;
}

export interface SeriesProgress {
  percent: number;
  mined: boolean;
  blocksRemaining: bigint;
  estimatedDays: number;
}

function computeRange(nameLength: number): { satStart: bigint; satEnd: bigint; satCount: bigint } {
  const suffixLen = nameLength - 5;
  const firstName = "bhang" + "a".repeat(suffixLen);
  const lastName = "bhang" + "z".repeat(suffixLen);
  const firstSat = nameToSat(firstName);
  const lastSat = nameToSat(lastName);
  const satStart = lastSat < firstSat ? lastSat : firstSat;
  const satEnd = lastSat > firstSat ? lastSat : firstSat;
  const satCount = satEnd - satStart + 1n;
  return { satStart, satEnd, satCount };
}

const seriesDefinitions: Array<{ nameLength: number; targetBlock: bigint; year: string; mined: boolean }> = [
  { nameLength: 11, targetBlock: 579_124n, year: "2019", mined: true },
  { nameLength: 10, targetBlock: 1_568_922n, year: "2038", mined: false },
  { nameLength: 9, targetBlock: 2_544_826n, year: "2056", mined: false },
  { nameLength: 8, targetBlock: 3_536_797n, year: "2075", mined: false },
  { nameLength: 7, targetBlock: 4_530_322n, year: "2094", mined: false },
  { nameLength: 6, targetBlock: 5_500_597n, year: "2112", mined: false },
  { nameLength: 5, targetBlock: 6_403_598n, year: "~2130", mined: false },
];

export const SERIES: Series[] = seriesDefinitions.map((def, i) => {
  const range = computeRange(def.nameLength);
  return {
    id: i + 1,
    nameLength: def.nameLength,
    satStart: range.satStart,
    satEnd: range.satEnd,
    satCount: range.satCount,
    targetBlock: def.targetBlock,
    estimatedYear: def.year,
    mined: def.mined,
  };
});

export function getSeriesProgress(series: Series, currentBlock: bigint): SeriesProgress {
  if (series.mined) {
    return { percent: 100, mined: true, blocksRemaining: 0n, estimatedDays: 0 };
  }
  const total = series.targetBlock;
  const elapsed = currentBlock > total ? total : currentBlock;
  const percent = Math.min(100, Math.round(Number((elapsed * 10000n) / total)) / 100);
  const blocksRemaining = currentBlock >= total ? 0n : total - currentBlock;
  const estimatedDays = Number(blocksRemaining) * 10 / 1440;
  return { percent, mined: currentBlock >= total, blocksRemaining, estimatedDays };
}

export function isBhangSat(sat: bigint): number | null {
  for (const s of SERIES) {
    if (sat >= s.satStart && sat <= s.satEnd) {
      return s.id;
    }
  }
  return null;
}
