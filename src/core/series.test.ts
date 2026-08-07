import { describe, it, expect } from "vitest";
import { SERIES, getSeriesProgress, isBhangSat } from "./series";

describe("SERIES", () => {
  it("has exactly 7 series", () => {
    expect(SERIES).toHaveLength(7);
  });

  it("Series 1 has 308,915,776 sats", () => {
    const s1 = SERIES[0];
    expect(s1.id).toBe(1);
    expect(s1.satCount).toBe(308_915_776n);
    expect(s1.nameLength).toBe(11);
    expect(s1.mined).toBe(true);
  });

  it("Series 7 has exactly 1 sat", () => {
    const s7 = SERIES[6];
    expect(s7.id).toBe(7);
    expect(s7.satCount).toBe(1n);
    expect(s7.satStart).toBe(s7.satEnd);
  });

  it("each series is 26x smaller than the previous", () => {
    for (let i = 1; i < SERIES.length; i++) {
      expect(SERIES[i - 1].satCount).toBe(SERIES[i].satCount * 26n);
    }
  });

  it("series sat ranges do not overlap", () => {
    for (let i = 1; i < SERIES.length; i++) {
      expect(SERIES[i].satStart).toBeGreaterThan(SERIES[i - 1].satEnd);
    }
  });
});

describe("getSeriesProgress", () => {
  it("returns 100% for Series 1 at any current block", () => {
    const progress = getSeriesProgress(SERIES[0], 946000n);
    expect(progress.percent).toBe(100);
    expect(progress.mined).toBe(true);
  });

  it("returns partial progress for Series 2", () => {
    const progress = getSeriesProgress(SERIES[1], 1_000_000n);
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.percent).toBeLessThan(100);
    expect(progress.mined).toBe(false);
    expect(progress.blocksRemaining).toBe(1_568_922n - 1_000_000n);
  });
});

describe("isBhangSat", () => {
  it("returns series id for a sat in Series 1 range", () => {
    expect(isBhangSat(1_773_906_100_000_000n)).toBe(1);
  });

  it("returns series id for the exact 'bhang' sat", () => {
    expect(isBhangSat(2_099_999_996_634_393n)).toBe(7);
  });

  it("returns null for a sat outside all ranges", () => {
    expect(isBhangSat(0n)).toBeNull();
    expect(isBhangSat(1_000_000_000_000_000n)).toBeNull();
  });
});
