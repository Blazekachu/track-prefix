import { describe, it, expect } from "vitest";
import {
  satToName,
  nameToSat,
  satToBlock,
  SUPPLY,
} from "./sat-math";

describe("satToName", () => {
  it("converts the last sat to 'a'", () => {
    expect(satToName(SUPPLY - 1n)).toBe("a");
  });

  it("converts known sat 1425808476896869 to 'dtdldkrbabc'", () => {
    expect(satToName(1425808476896869n)).toBe("dtdldkrbabc");
  });

  it("converts the 'bhang' sat correctly", () => {
    expect(satToName(2099999996634393n)).toBe("bhang");
  });
});

describe("nameToSat", () => {
  it("converts 'a' to the last sat", () => {
    expect(nameToSat("a")).toBe(SUPPLY - 1n);
  });

  it("converts 'dtdldkrbabc' to known sat", () => {
    expect(nameToSat("dtdldkrbabc")).toBe(1425808476896869n);
  });

  it("converts 'bhang' to its sat number", () => {
    expect(nameToSat("bhang")).toBe(2099999996634393n);
  });

  it("roundtrips with satToName", () => {
    const sats = [0n, 100n, 1425808476896869n, 2099999996634393n];
    for (const sat of sats) {
      expect(nameToSat(satToName(sat))).toBe(sat);
    }
  });
});

describe("satToBlock", () => {
  it("returns 0 for sat 0", () => {
    expect(satToBlock(0n)).toBe(0n);
  });

  it("returns correct block for a sat in epoch 0", () => {
    expect(satToBlock(4_999_999_999n)).toBe(0n);
    expect(satToBlock(5_000_000_000n)).toBe(1n);
  });

  it("returns ~579124 for Series 1 start sat", () => {
    const block = satToBlock(1_773_906_020_861_562n);
    expect(block).toBe(579124n);
  });

  it("returns ~579125 for Series 1 end sat", () => {
    const block = satToBlock(1_773_906_329_777_337n);
    expect(block).toBe(579125n);
  });
});
