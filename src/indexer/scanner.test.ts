import { describe, it, expect } from "vitest";
import { firstSatOfUtxo } from "./scanner";
import type { UtxoRow } from "@/db/queries";

function row(partial: Partial<UtxoRow> & Pick<UtxoRow, "sat_range_start" | "input_offset">): UtxoRow {
  return {
    outpoint: "abc:0",
    address: "addr",
    sat_range_end: partial.sat_range_end ?? partial.sat_range_start,
    sat_count: 1,
    spent: 0,
    last_moved: null,
    first_seen: "",
    last_checked: "",
    ...partial,
  };
}

describe("firstSatOfUtxo", () => {
  it("equals range start when offset is 0", () => {
    expect(
      firstSatOfUtxo(row({ sat_range_start: "1000", input_offset: "0" }))
    ).toBe(1000n);
  });

  it("subtracts input_offset for mid-UTXO tracked slices", () => {
    expect(
      firstSatOfUtxo(row({ sat_range_start: "1500", input_offset: "500" }))
    ).toBe(1000n);
  });
});
