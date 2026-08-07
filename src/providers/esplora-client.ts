/**
 * Shared Esplora client — the single point through which every Esplora HTTP GET
 * flows (the refresh in public-provider.ts AND the snapshot export script).
 *
 * Why this exists: public free Esplora endpoints ban a residential IP when a
 * client ignores their 429 ("slow down") and keeps hammering. The old code did
 * exactly that — it re-hit a 429'd provider ~every 350ms, hundreds of times per
 * run. This client instead:
 *
 *   1. Honors the rate-limit signal: a 429 puts that provider on a *cooldown*
 *      (Retry-After if given, else exponential backoff) and we STOP sending it
 *      requests until the cooldown expires.
 *   2. Persists provider health to disk, so the cooldown is respected across the
 *      two snapshot processes (refresh → export) and across the 4-hourly runs —
 *      a banned provider is probed at most once per run, never hammered.
 *   3. Serializes all requests through one global rate limiter (no parallel
 *      bursts).
 *   4. De-dupes /outspends within a run (UTXOs sharing a parent tx → 1 request).
 *
 * CRITICAL INVARIANT (never-miss): when every provider is unavailable, esploraGet
 * THROWS. It never fabricates an empty/"unspent" result. Callers on the trace
 * path let that throw propagate to the tracer's catch, which leaves the UTXO
 * live to be re-checked next run. We therefore cache successes only, never
 * failures. This is what keeps a network outage from silently dropping a BHANG
 * sat movement.
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";

// ─── Provider list — single source of truth for both clients ───
// Order is preserved as-is on purpose: cooldown makes ordering nearly
// irrelevant (a bad provider is skipped after one probe), so we don't churn it.
const DEFAULT_ESPLORA_BASES = [
  "https://blockstream.info/api",
  "https://mempool.emzy.de/api",
  "https://memepool.space/api",
  "https://mempool.space/api",
];

export function getEsploraBases(): string[] {
  const configured = process.env.ESPLORA_BASE_URLS
    ?.split(",")
    .map((base) => base.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ESPLORA_BASES;
}

// ─── Tunables ───
const DEFAULT_TIMEOUT = 10_000; // per-request abort
const RATELIMIT_BASE_MS = 15 * 60_000; // first 429 → 15 min
const RATELIMIT_MAX_MS = 4 * 60 * 60_000; // cap rate-limit cooldown at 4 h
const RETRY_AFTER_MAX_MS = 6 * 60 * 60_000; // cap an honored Retry-After at 6 h
const TRANSIENT_BASE_MS = 2 * 60_000; // first network/timeout failure → 2 min
const TRANSIENT_MAX_MS = 30 * 60_000; // cap transient cooldown at 30 min
const DEFAULT_HEADERS: Record<string, string> = { "User-Agent": "bhang-tracker/0.1" };

function defaultDelayMs(): number {
  return parseInt(process.env.API_DELAY_MS || "350", 10);
}

// ─── Persisted provider health ───
interface ProviderHealth {
  cooldownUntil: number; // epoch ms; 0 (or past) = available
  consecutiveFailures: number;
  lastStatus?: string;
  lastError?: string;
  updatedAt?: string;
}
type HealthStore = Record<string, ProviderHealth>;

function healthPath(): string {
  if (process.env.PROVIDER_HEALTH_PATH) return process.env.PROVIDER_HEALTH_PATH;
  const dbPath = path.resolve(process.env.DATABASE_PATH || "./bhang-tracker.db");
  return path.join(path.dirname(dbPath), "provider-health.json");
}

let healthCache: HealthStore | null = null;

function loadHealth(): HealthStore {
  if (healthCache) return healthCache;
  try {
    healthCache = JSON.parse(readFileSync(healthPath(), "utf8")) as HealthStore;
  } catch {
    healthCache = {};
  }
  return healthCache;
}

function persistHealth(store: HealthStore): void {
  healthCache = store;
  try {
    writeFileSync(healthPath(), JSON.stringify(store, null, 2));
  } catch (err) {
    console.warn(`[provider] could not persist health file: ${err}`);
  }
}

function getHealth(store: HealthStore, base: string): ProviderHealth {
  if (!store[base]) store[base] = { cooldownUntil: 0, consecutiveFailures: 0 };
  return store[base];
}

function isAvailable(h: ProviderHealth, now: number): boolean {
  return !h.cooldownUntil || h.cooldownUntil <= now;
}

function backoff(baseMs: number, maxMs: number, priorFailures: number): number {
  const factor = Math.pow(2, Math.min(priorFailures, 10));
  return Math.min(baseMs * factor, maxMs);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs)) return Math.min(Math.max(0, secs * 1000), RETRY_AFTER_MAX_MS);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), RETRY_AFTER_MAX_MS);
  return null;
}

function coolDown(h: ProviderHealth, ms: number, status: string, errMsg: string, now: number): void {
  // Cooldown grows with PRIOR failures, so increment after computing.
  h.cooldownUntil = now + ms;
  h.consecutiveFailures += 1;
  h.lastStatus = status;
  h.lastError = errMsg;
  h.updatedAt = new Date(now).toISOString();
}

function markHealthy(h: ProviderHealth, now: number): boolean {
  if (h.cooldownUntil || h.consecutiveFailures) {
    h.cooldownUntil = 0;
    h.consecutiveFailures = 0;
    h.lastStatus = "ok";
    h.updatedAt = new Date(now).toISOString();
    return true;
  }
  return false;
}

// ─── Global rate limiter (serializes all outgoing requests) ───
let lastRequestAt = 0;
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
async function throttle(delayMs: number): Promise<void> {
  if (delayMs <= 0) {
    lastRequestAt = Date.now();
    return;
  }
  const wait = lastRequestAt + delayMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

// ─── Per-process /outspends de-dupe (successes only) ───
const outspendsCache = new Map<string, unknown>();
function isCacheable(reqPath: string): boolean {
  return reqPath.includes("/outspends");
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  headers?: Record<string, string>
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface EsploraGetOpts {
  parse?: "json" | "text";
  timeoutMs?: number;
  delayMs?: number;
  headers?: Record<string, string>;
  /** Explicit provider list override (else env ESPLORA_BASE_URLS / defaults). */
  bases?: string[];
}

/**
 * GET an Esplora path, walking the provider list but skipping any provider on
 * cooldown. Returns parsed json/text on first success. Throws only when every
 * provider is unavailable (cooled or failed this attempt) — never returns a
 * fabricated empty result.
 */
export async function esploraGet<T>(reqPath: string, opts: EsploraGetOpts = {}): Promise<T> {
  const parse = opts.parse ?? "json";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const delayMs = opts.delayMs ?? defaultDelayMs();

  if (isCacheable(reqPath) && outspendsCache.has(reqPath)) {
    return outspendsCache.get(reqPath) as T;
  }

  const bases = opts.bases?.length ? opts.bases : getEsploraBases();
  const store = loadHealth();
  let healthChanged = false;
  let lastErr: Error | null = null;

  for (const base of bases) {
    const h = getHealth(store, base);
    if (!isAvailable(h, Date.now())) {
      lastErr =
        lastErr ??
        new Error(`${base} on cooldown until ${new Date(h.cooldownUntil).toISOString()}`);
      continue;
    }

    await throttle(delayMs);
    const url = `${base}${reqPath}`;
    try {
      const res = await fetchWithTimeout(url, timeoutMs, opts.headers);

      if (res.status === 429 || res.status === 406) {
        const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
        const ms = retryAfter ?? backoff(RATELIMIT_BASE_MS, RATELIMIT_MAX_MS, h.consecutiveFailures);
        coolDown(h, ms, String(res.status), "rate limited", Date.now());
        healthChanged = true;
        console.warn(
          `[provider] ${base} ${res.status} rate-limited → cooling down ${Math.round(ms / 60000)}m`
        );
        lastErr = new Error(`HTTP ${res.status} fetching ${url}: rate limited`);
        continue;
      }
      if (res.status >= 500) {
        const ms = backoff(TRANSIENT_BASE_MS, TRANSIENT_MAX_MS, h.consecutiveFailures);
        coolDown(h, ms, String(res.status), res.statusText, Date.now());
        healthChanged = true;
        console.warn(`[provider] ${base} HTTP ${res.status} → cooling down ${Math.round(ms / 60000)}m`);
        lastErr = new Error(`HTTP ${res.status} fetching ${url}: ${res.statusText}`);
        continue;
      }
      if (!res.ok) {
        // 4xx other than 429/406 is request-specific (e.g. unknown tx), not a
        // provider-health problem — try the next provider but don't cool this one.
        lastErr = new Error(`HTTP ${res.status} fetching ${url}: ${res.statusText}`);
        continue;
      }

      const data = (parse === "text" ? await res.text() : await res.json()) as T;
      if (markHealthy(h, Date.now())) healthChanged = true;
      if (healthChanged) persistHealth(store);
      if (isCacheable(reqPath)) outspendsCache.set(reqPath, data);
      return data;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      const ms = backoff(TRANSIENT_BASE_MS, TRANSIENT_MAX_MS, h.consecutiveFailures);
      const status = lastErr.name === "AbortError" ? "timeout" : "error";
      coolDown(h, ms, status, lastErr.message, Date.now());
      healthChanged = true;
      console.warn(
        `[provider] ${base} failed for ${reqPath}: ${lastErr.message} → cooling down ${Math.round(ms / 60000)}m`
      );
      continue;
    }
  }

  if (healthChanged) persistHealth(store);
  // Every provider cooled or failed — THROW. Never fabricate a result; the
  // tracer's catch will leave the UTXO live for the next run (never-miss).
  throw lastErr || new Error(`All Esplora providers unavailable for ${reqPath}`);
}

/** Test-only: clear in-memory health cache, rate-limiter clock, and dedupe cache. */
export function __resetForTests(): void {
  healthCache = null;
  lastRequestAt = 0;
  outspendsCache.clear();
}
