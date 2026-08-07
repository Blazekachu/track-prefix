import { describe, it, expect } from "vitest";
import { buildSeriesRanges } from "./series-ranges";
import { originBlockHeights } from "./origin-blocks";

describe("originBlockHeights", () => {
  it("returns bhang series-1 origin blocks", () => {
    const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
    expect(originBlockHeights(s1.satStart, s1.satEnd)).toEqual([
      579124, 579125,
    ]);
  });
});
