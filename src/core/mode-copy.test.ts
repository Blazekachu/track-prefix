import { describe, it, expect } from "vitest";
import { MODE_CAPABILITIES, modeCanInscriptionScan } from "./mode-copy";

describe("mode-copy", () => {
  it("btc_node cannot inscription-scan; btc_ord can", () => {
    expect(modeCanInscriptionScan("btc_node")).toBe(false);
    expect(modeCanInscriptionScan("btc_ord")).toBe(true);
    expect(modeCanInscriptionScan("public_api")).toBe(true);
  });

  it("every mode has disclosure fields", () => {
    for (const mode of Object.keys(MODE_CAPABILITIES) as Array<
      keyof typeof MODE_CAPABILITIES
    >) {
      const c = MODE_CAPABILITIES[mode];
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.summary.length).toBeGreaterThan(20);
      expect(c.utxoTrace.length).toBeGreaterThan(0);
      expect(c.inscriptions.length).toBeGreaterThan(0);
    }
  });
});
