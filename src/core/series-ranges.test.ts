import { describe, it, expect } from "vitest";
import { buildSeriesRanges } from "./series-ranges";

describe("buildSeriesRanges", () => {
  it("bhang series 1 has 308915776 sats", () => {
    const s1 = buildSeriesRanges("bhang").find((s) => s.nameLength === 11)!;
    expect(s1.satCount).toBe(308_915_776n);
  });

  it("returns 7 series for bhang", () => {
    expect(buildSeriesRanges("bhang")).toHaveLength(7);
  });
});
