import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { existsSync, rmSync, writeFileSync, readFileSync } from "fs";
import { esploraGet, __resetForTests } from "./esplora-client";

const A = "https://a.test/api";
const B = "https://b.test/api";
const HEALTH = path.join(tmpdir(), "bhang-provider-health.test.json");

// Minimal Response stand-in for the mocked global fetch.
function resp(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: `HTTP${status}`,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

type Handler = (url: string) => Response | Promise<Response>;
let calls: string[] = [];

// Install a fetch mock routed by provider base. A request to a base with no
// handler simulates a network failure (mirrors a dead host).
function install(routes: { a?: Handler; b?: Handler }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.startsWith(A) && routes.a) return routes.a(url);
      if (url.startsWith(B) && routes.b) return routes.b(url);
      throw new TypeError("fetch failed");
    })
  );
}

function readHealth(): Record<string, { cooldownUntil: number; consecutiveFailures: number; lastStatus?: string }> {
  return JSON.parse(readFileSync(HEALTH, "utf8"));
}

beforeEach(() => {
  process.env.ESPLORA_BASE_URLS = `${A},${B}`;
  process.env.PROVIDER_HEALTH_PATH = HEALTH;
  if (existsSync(HEALTH)) rmSync(HEALTH);
  calls = [];
  __resetForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (existsSync(HEALTH)) rmSync(HEALTH);
  delete process.env.ESPLORA_BASE_URLS;
  delete process.env.PROVIDER_HEALTH_PATH;
});

describe("esploraGet provider cooldown", () => {
  it("a 429 cools the provider and it is skipped on the next call", async () => {
    install({ a: () => resp(429, ""), b: () => resp(200, { ok: 1 }) });

    const r1 = await esploraGet<{ ok: number }>("/x", { delayMs: 0 });
    expect(r1).toEqual({ ok: 1 });

    const h = readHealth();
    expect(h[A].cooldownUntil).toBeGreaterThan(Date.now());
    expect(h[A].consecutiveFailures).toBe(1);

    // Second call: A is on cooldown, so it must not be fetched at all.
    calls = [];
    const r2 = await esploraGet<{ ok: number }>("/y", { delayMs: 0 });
    expect(r2).toEqual({ ok: 1 });
    expect(calls.some((u) => u.startsWith(A))).toBe(false);
    expect(calls.some((u) => u.startsWith(B))).toBe(true);
  });

  it("honors a Retry-After header on 429", async () => {
    install({ a: () => resp(429, "", { "retry-after": "1800" }), b: () => resp(200, { ok: 1 }) });
    await esploraGet("/x", { delayMs: 0 });

    const remaining = readHealth()[A].cooldownUntil - Date.now();
    expect(remaining).toBeGreaterThan(1_700_000);
    expect(remaining).toBeLessThanOrEqual(1_800_000 + 5_000);
  });

  it("a successful fetch resets a provider's prior failure count", async () => {
    // Seed A as previously failed but with an already-expired cooldown.
    writeFileSync(
      HEALTH,
      JSON.stringify({ [A]: { cooldownUntil: 0, consecutiveFailures: 3, lastStatus: "429" } })
    );
    __resetForTests(); // force a re-read of the seeded file

    install({ a: () => resp(200, { ok: 1 }) });
    const r = await esploraGet<{ ok: number }>("/x", { delayMs: 0 });
    expect(r).toEqual({ ok: 1 });

    const h = readHealth();
    expect(h[A].consecutiveFailures).toBe(0);
    expect(h[A].cooldownUntil).toBe(0);
  });

  it("throws when every provider is unavailable (never fabricates a result)", async () => {
    install({ a: () => resp(429, ""), b: () => resp(429, "") });
    await expect(esploraGet("/x", { delayMs: 0 })).rejects.toThrow();
  });
});

describe("esploraGet /outspends de-dupe", () => {
  it("caches /outspends successes within a run but refetches other paths", async () => {
    let aHits = 0;
    install({
      a: () => {
        aHits++;
        return resp(200, [{ spent: false }]);
      },
    });

    const p = "/tx/abc/outspends";
    const r1 = await esploraGet(p, { delayMs: 0 });
    const r2 = await esploraGet(p, { delayMs: 0 });
    expect(r1).toEqual(r2);
    expect(aHits).toBe(1); // second call served from cache

    aHits = 0;
    await esploraGet("/tx/abc", { delayMs: 0 });
    await esploraGet("/tx/abc", { delayMs: 0 });
    expect(aHits).toBe(2); // non-outspends path is fetched each time
  });
});
