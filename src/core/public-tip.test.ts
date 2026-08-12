import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPublicChainTip,
  formatTipError,
  PUBLIC_TIP_SOURCES,
} from "./public-tip";

function jsonResp(status: number, body: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `HTTP${status}`,
    text: async () => body,
  } as unknown as Response;
}

describe("PUBLIC_TIP_SOURCES", () => {
  it("tries mempool.space first, then other public explorers", () => {
    expect(PUBLIC_TIP_SOURCES[0]?.name).toBe("mempool.space");
    expect(PUBLIC_TIP_SOURCES.map((s) => s.name)).toEqual([
      "mempool.space",
      "blockstream.info",
      "mempool.emzy.de",
    ]);
  });
});

describe("formatTipError", () => {
  it("names each source that failed and why", () => {
    expect(
      formatTipError([
        { source: "mempool.space", reason: "timed out" },
        { source: "blockstream.info", reason: "HTTP 503" },
      ])
    ).toBe("mempool.space: timed out · blockstream.info: HTTP 503");
  });
});

describe("fetchPublicChainTip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns height from mempool.space when it responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("mempool.space")) return jsonResp(200, "962168");
        throw new Error(`unexpected ${url}`);
      })
    );

    await expect(fetchPublicChainTip({ timeoutMs: 50 })).resolves.toEqual({
      ok: true,
      height: 962168,
      source: "mempool.space",
    });
  });

  it("falls through to the next explorer when mempool.space fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("mempool.space")) {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        if (String(url).includes("blockstream.info")) return jsonResp(200, "962170");
        throw new Error(`unexpected ${url}`);
      })
    );

    await expect(fetchPublicChainTip({ timeoutMs: 50 })).resolves.toEqual({
      ok: true,
      height: 962170,
      source: "blockstream.info",
    });
  });

  it("returns every source failure when none can provide height", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResp(503, "unavailable"))
    );

    const result = await fetchPublicChainTip({ timeoutMs: 50 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures).toEqual([
      { source: "mempool.space", reason: "HTTP 503" },
      { source: "blockstream.info", reason: "HTTP 503" },
      { source: "mempool.emzy.de", reason: "HTTP 503" },
    ]);
    expect(result.error).toContain("mempool.space: HTTP 503");
    expect(result.error).toContain("blockstream.info: HTTP 503");
  });
});
