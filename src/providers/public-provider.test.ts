import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { existsSync, rmSync } from "fs";
import { PublicOrdProvider } from "./public-provider";
import { __resetForTests } from "./esplora-client";

// Isolate the shared client's persisted provider-health to a temp file so these
// tests never write into the repo working tree or leak cooldown state between runs.
const HEALTH = path.join(tmpdir(), "bhang-provider-health.pp-test.json");

beforeEach(() => {
  process.env.PROVIDER_HEALTH_PATH = HEALTH;
  if (existsSync(HEALTH)) rmSync(HEALTH);
  __resetForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (existsSync(HEALTH)) rmSync(HEALTH);
  delete process.env.PROVIDER_HEALTH_PATH;
});

describe("PublicOrdProvider", () => {
  it("falls back to the next Esplora provider when the first one fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://primary.example")) {
        throw new Error("primary down");
      }
      if (url.endsWith("/block/abc123/txids")) {
        return new Response(JSON.stringify(["coinbase"]), { status: 200 });
      }
      return new Response("abc123", { status: 200 });
    });

    const provider = new PublicOrdProvider(0, [
      "https://primary.example",
      "https://fallback.example",
    ]);

    await expect(provider.getBlockTxids(579124)).resolves.toEqual(["coinbase"]);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://primary.example/block-height/579124",
      expect.any(Object)
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fallback.example/block-height/579124",
      expect.any(Object)
    );
  });
});
