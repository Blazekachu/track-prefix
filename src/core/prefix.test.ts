import { describe, it, expect } from "vitest";
import { validatePrefix } from "./prefix";

describe("validatePrefix", () => {
  it("accepts lowercase a-z", () => {
    expect(validatePrefix("bhang")).toEqual({ ok: true, prefix: "bhang" });
  });
  it("rejects empty", () => {
    expect(validatePrefix("").ok).toBe(false);
  });
  it("rejects non a-z", () => {
    expect(validatePrefix("bh1").ok).toBe(false);
  });
  it("normalizes trim and case", () => {
    expect(validatePrefix("  BhAnG  ")).toEqual({ ok: true, prefix: "bhang" });
  });
});
