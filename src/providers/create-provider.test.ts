import { describe, it, expect, vi, afterEach } from "vitest";
import { BitcoinRpcClient } from "./bitcoin-rpc";
import { createProvider } from "./create-provider";
import { validateModeCredentials } from "./mode";

describe("validateModeCredentials", () => {
  it("requires rpc fields for btc_node", () => {
    expect(() =>
      validateModeCredentials({ mode: "btc_node", modeCredentials: {} })
    ).toThrow(/rpcUrl/);
    expect(() =>
      validateModeCredentials({
        mode: "btc_node",
        modeCredentials: { rpcUrl: "http://127.0.0.1:8332" },
      })
    ).toThrow(/rpcUser/);
  });

  it("requires ordUrl for btc_ord", () => {
    expect(() =>
      validateModeCredentials({
        mode: "btc_ord",
        modeCredentials: {
          rpcUrl: "http://127.0.0.1:8332",
          rpcUser: "u",
        },
      })
    ).toThrow(/ordUrl/);
  });
});

describe("createProvider", () => {
  it("builds public provider by default", () => {
    const { kind, label } = createProvider(null, 0);
    expect(kind).toBe("public_api");
    expect(label).toContain("public");
  });

  it("builds bitcoin-rpc provider for btc_node", () => {
    const { kind, label } = createProvider(
      {
        mode: "btc_node",
        modeCredentials: {
          rpcUrl: "http://127.0.0.1:8332",
          rpcUser: "user",
          rpcPassword: "pass",
        },
      },
      0
    );
    expect(kind).toBe("btc_node");
    expect(label).toContain("bitcoin-rpc");
  });

  it("builds local-ord provider for btc_ord", () => {
    const { kind, label } = createProvider(
      {
        mode: "btc_ord",
        modeCredentials: {
          rpcUrl: "http://127.0.0.1:8332",
          rpcUser: "user",
          rpcPassword: "pass",
          ordUrl: "http://127.0.0.1:80",
        },
      },
      0
    );
    expect(kind).toBe("btc_ord");
    expect(label).toContain("local-ord");
  });

  it("rejects btc_ord without ordUrl", () => {
    expect(() =>
      createProvider({
        mode: "btc_ord",
        modeCredentials: {
          rpcUrl: "http://127.0.0.1:8332",
          rpcUser: "user",
        },
      })
    ).toThrow(/ordUrl/);
  });
});

describe("BitcoinRpcClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts JSON-RPC and returns result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ result: 900000, error: null, id: 1 }),
      }))
    );
    const client = new BitcoinRpcClient({
      rpcUrl: "http://127.0.0.1:8332",
      rpcUser: "u",
      rpcPassword: "p",
    });
    await expect(client.getblockcount()).resolves.toBe(900000);
    expect(fetch).toHaveBeenCalled();
  });

  it("surfaces RPC error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          result: null,
          error: { code: -28, message: "Loading block index…" },
          id: 1,
        }),
      }))
    );
    const client = new BitcoinRpcClient({
      rpcUrl: "http://127.0.0.1:8332",
      rpcUser: "u",
      rpcPassword: "p",
    });
    await expect(client.getblockcount()).rejects.toThrow(/Loading block index/);
  });
});
