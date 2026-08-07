import { describe, it, expect } from "vitest";
import { buildSeriesRanges } from "./series-ranges";
import { splitIntoBlocks } from "./segments";

describe("splitIntoBlocks", () => {
  it("splits bhang s1 into two origin blocks", () => {
    const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
    const segs = splitIntoBlocks(s1.satStart, s1.satEnd);
    expect(segs.map((s) => Number(s.height))).toEqual([579124, 579125]);
  });
});
