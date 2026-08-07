import { splitIntoBlocks } from "./segments";
import type { SeriesRange } from "./series-ranges";

export type BlockStatus = "mined" | "future";

/** A block is mined if its height is at or below the current tip. */
export function classifyBlock(height: bigint, tip: bigint): BlockStatus {
  return height <= tip ? "mined" : "future";
}

/** True when every block that created sats in this series is at or below tip. */
export function seriesIsMined(series: SeriesRange, tip: bigint): boolean {
  const segs = splitIntoBlocks(series.satStart, series.satEnd);
  if (segs.length === 0) return false;
  return segs.every((s) => s.height <= tip);
}
