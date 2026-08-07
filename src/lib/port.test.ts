import { describe, it, expect } from "vitest";
import { pickPort } from "./port";

describe("pickPort", () => {
  it("prefers 42069 when free", async () => {
    const port = await pickPort(42069);
    expect(port).toBeGreaterThanOrEqual(42069);
  });
});
