import { describe, it, expect } from "vitest";
import { buildSeriesRanges } from "./series-ranges";
import { getMiningProgress } from "./mining-progress";
import { seriesIsMined } from "./forecast";

describe("mining-progress", () => {
  it("returns 100% when series is mined", () => {
    const ranges = buildSeriesRanges("exquisite");
    const s1 = ranges.find((r) => r.id === 1)!;
    const tip = 961_387n;
    expect(seriesIsMined(s1, tip)).toBe(true);
    const p = getMiningProgress(s1, tip);
    expect(p.mined).toBe(true);
    expect(p.miningPercent).toBe(100);
    expect(p.trackable).toBe(true);
    expect(p.blocksRemaining).toBe(0);
  });

  it("returns partial percent for unmined series", () => {
    const ranges = buildSeriesRanges("bhang");
    const s2 = ranges.find((r) => r.id === 2)!;
    const tip = 1_000_000n;
    expect(seriesIsMined(s2, tip)).toBe(false);
    const p = getMiningProgress(s2, tip);
    expect(p.mined).toBe(false);
    expect(p.trackable).toBe(false);
    expect(p.miningPercent).toBeGreaterThan(0);
    expect(p.miningPercent).toBeLessThan(100);
    expect(p.blocksRemaining).toBeGreaterThan(0);
  });
});
