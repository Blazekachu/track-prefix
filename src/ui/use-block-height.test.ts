import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTipHeight } from "./use-block-height";

describe("fetchTipHeight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads height from /api/block-height", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, height: 962168, source: "mempool.space" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchTipHeight()).resolves.toEqual({
      status: "ok",
      height: 962168,
      source: "mempool.space",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/block-height");
  });

  it("surfaces the provider error instead of a blank height", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          ok: false,
          error:
            "mempool.space: timed out · blockstream.info: HTTP 503 · mempool.emzy.de: HTTP 503",
        }),
      })
    );

    await expect(fetchTipHeight()).resolves.toEqual({
      status: "error",
      error:
        "mempool.space: timed out · blockstream.info: HTTP 503 · mempool.emzy.de: HTTP 503",
    });
  });

  it("explains a network failure talking to the local API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    await expect(fetchTipHeight()).resolves.toEqual({
      status: "error",
      error: "Local /api/block-height request failed: Failed to fetch",
    });
  });
});
