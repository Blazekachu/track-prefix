import { seriesIsMined } from "./forecast";
import { splitIntoBlocks } from "./segments";
import type { SeriesRange } from "./series-ranges";

export interface MiningProgress {
  firstBlock: number;
  targetBlock: number;
  mined: boolean;
  /** Progress toward target block (0–100). Read-only forecast. */
  miningPercent: number;
  blocksRemaining: number;
  estimatedYears: number;
  /** UTXO tracing allowed only when mined. */
  trackable: boolean;
}

export function getMiningProgress(
  range: SeriesRange,
  tip: bigint
): MiningProgress {
  const segs = splitIntoBlocks(range.satStart, range.satEnd);
  if (segs.length === 0) {
    return {
      firstBlock: 0,
      targetBlock: 0,
      mined: false,
      miningPercent: 0,
      blocksRemaining: 0,
      estimatedYears: 0,
      trackable: false,
    };
  }

  const firstBlock = Number(segs[0].height);
  const targetBlock = Number(segs[segs.length - 1].height);
  const mined = seriesIsMined(range, tip);
  const tipNum = Number(tip);

  const miningPercent = mined
    ? 100
    : Math.min(100, Math.round((tipNum / targetBlock) * 10000) / 100);

  const blocksRemaining = mined ? 0 : Math.max(0, targetBlock - tipNum);
  const estimatedYears =
    blocksRemaining > 0 ? (blocksRemaining * 10) / 525960 : 0;

  return {
    firstBlock,
    targetBlock,
    mined,
    miningPercent,
    blocksRemaining,
    estimatedYears,
    trackable: mined,
  };
}
