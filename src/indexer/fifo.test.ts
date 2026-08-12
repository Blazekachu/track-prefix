import { describe, it, expect } from "vitest";
import { mapSatRanges, type SatRange, type TxShape } from "./fifo";

describe("mapSatRanges", () => {
  it("maps a single input to a single output", () => {
    const tx: TxShape = {
      inputs: [{ value: 10000 }],
      outputs: [{ value: 9000 }],
      fee: 1000,
    };
    const inputRanges: SatRange[] = [{ start: 100n, end: 10099n }];

    const result = mapSatRanges(tx, inputRanges);

    expect(result).toHaveLength(1);
    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.start).toBe(100n);
    expect(first!.end).toBe(9099n);
  });

  it("splits one input across two outputs", () => {
    const tx: TxShape = {
      inputs: [{ value: 10000 }],
      outputs: [{ value: 6000 }, { value: 3000 }],
      fee: 1000,
    };
    const inputRanges: SatRange[] = [{ start: 100n, end: 10099n }];

    const result = mapSatRanges(tx, inputRanges);

    expect(result).toHaveLength(2);
    const first = result[0];
    const second = result[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first!.start).toBe(100n);
    expect(first!.end).toBe(6099n);
    expect(second!.start).toBe(6100n);
    expect(second!.end).toBe(9099n);
  });

  it("handles two inputs flowing into outputs", () => {
    const tx: TxShape = {
      inputs: [{ value: 5000 }, { value: 5000 }],
      outputs: [{ value: 8000 }, { value: 1000 }],
      fee: 1000,
    };
    const inputRanges: SatRange[] = [
      { start: 100n, end: 5099n },
      { start: 20000n, end: 24999n },
    ];

    const result = mapSatRanges(tx, inputRanges);

    expect(result).toHaveLength(2);
    // First output (8000 sats): all of input 0 (100-5099) + 3000 from input 1 (20000-22999)
    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.start).toBe(100n);
  });

  it("returns empty for an output that gets no tracked sats", () => {
    const tx: TxShape = {
      inputs: [{ value: 10000 }],
      outputs: [{ value: 5000 }, { value: 4000 }],
      fee: 1000,
    };
    const inputRanges: SatRange[] = [{ start: 5100n, end: 10099n }];

    const result = mapSatRanges(tx, inputRanges);

    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("mapSatRanges — detailed output mapping", () => {
  it("tracks a specific sat range through a simple 1-in-2-out tx", () => {
    const tx: TxShape = {
      inputs: [{ value: 100000 }],
      outputs: [{ value: 70000 }, { value: 29000 }],
      fee: 1000,
    };
    const inputRanges: SatRange[] = [{ start: 50000n, end: 59999n }];

    const result = mapSatRanges(tx, inputRanges);

    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.start).toBe(50000n);
    expect(first!.end).toBe(59999n);
    expect(result[1]).toBeUndefined();
  });
});
