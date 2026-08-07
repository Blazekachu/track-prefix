import { describe, it, expect } from "vitest";
import { resolveEsploraBases } from "./mode";

describe("resolveEsploraBases", () => {
  it("public_api uses default bases", () => {
    expect(
      resolveEsploraBases({ mode: "public_api", modeCredentials: {} }).length
    ).toBeGreaterThan(0);
  });

  it("paid_api requires base URL", () => {
    expect(() =>
      resolveEsploraBases({ mode: "paid_api", modeCredentials: {} })
    ).toThrow(/apiBaseUrl/);
  });

  it("paid_api uses provided base", () => {
    expect(
      resolveEsploraBases({
        mode: "paid_api",
        modeCredentials: { apiBaseUrl: "https://example.com/api/" },
      })
    ).toEqual(["https://example.com/api"]);
  });

  it("btc modes do not resolve Esplora bases", () => {
    expect(() =>
      resolveEsploraBases({
        mode: "btc_node",
        modeCredentials: {
          rpcUrl: "http://127.0.0.1:8332",
          rpcUser: "u",
        },
      })
    ).toThrow(/does not use Esplora/);
  });
});
