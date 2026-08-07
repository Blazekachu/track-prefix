import { splitIntoBlocks } from "./segments";

/** Block heights whose coinbase subsidy intersects the sat range. */
export function originBlockHeights(
  satStart: bigint,
  satEnd: bigint
): number[] {
  return splitIntoBlocks(satStart, satEnd).map((s) => Number(s.height));
}
