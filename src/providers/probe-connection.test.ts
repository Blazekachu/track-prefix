import { describe, it, expect, vi, afterEach } from "vitest";
import { probeProviderConnection } from "./create-provider";

describe("probeProviderConnection btc_node", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("fails clearly when txindex is missing", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body || "{}") as { method?: string };
        calls.push(body.method || "");
        if (body.method === "getblockchaininfo") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: { chain: "main", blocks: 900000, headers: 900000 },
              error: null,
              id: 1,
            }),
          };
        }
        if (body.method === "getindexinfo") {
          return {
            ok: true,
            status: 200,
            json: async () => ({ result: {}, error: null, id: 2 }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: null, error: null, id: 3 }),
        };
      })
    );

    const result = await probeProviderConnection({
      mode: "btc_node",
      modeCredentials: {
        rpcUrl: "http://127.0.0.1:8332",
        rpcUser: "u",
        rpcPassword: "p",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("txindex");
    expect(result.error).toMatch(/txindex/i);
    expect(calls).toContain("getblockchaininfo");
    expect(calls).toContain("getindexinfo");
  });

  it("fails when chain is not main", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          result: { chain: "test", blocks: 100, headers: 100 },
          error: null,
          id: 1,
        }),
      }))
    );

    const result = await probeProviderConnection({
      mode: "btc_node",
      modeCredentials: {
        rpcUrl: "http://127.0.0.1:18332",
        rpcUser: "u",
        rpcPassword: "p",
      },
    });

    expect(result.ok).toBe(false);
    expect(result.failedStep).toBe("chain");
    expect(result.error).toMatch(/mainnet/i);
  });

  it("succeeds when mainnet + txindex synced", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: { body?: string }) => {
        const body = JSON.parse(init?.body || "{}") as { method?: string };
        if (body.method === "getblockchaininfo") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: { chain: "main", blocks: 900000, headers: 900000 },
              error: null,
              id: 1,
            }),
          };
        }
        if (body.method === "getindexinfo") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              result: {
                txindex: { synced: true, best_block_height: 900000 },
              },
              error: null,
              id: 2,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ result: null, error: null, id: 3 }),
        };
      })
    );

    const result = await probeProviderConnection({
      mode: "btc_node",
      modeCredentials: {
        rpcUrl: "http://127.0.0.1:8332",
        rpcUser: "u",
        rpcPassword: "p",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.tipHeight).toBe(900000);
    expect(result.txindex?.synced).toBe(true);
  });
});
