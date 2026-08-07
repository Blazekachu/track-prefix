import { describe, it, expect } from "vitest";
import { buildSeriesRanges } from "./series-ranges";
import { seriesIsMined } from "./forecast";

describe("seriesIsMined", () => {
  it("marks series mined only when all blocks <= tip", () => {
    const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
    expect(seriesIsMined(s1, 579125n)).toBe(true);
    expect(seriesIsMined(s1, 579123n)).toBe(false);
  });
});
