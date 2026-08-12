export type TipFailure = { source: string; reason: string };

export type PublicTipResult =
  | { ok: true; height: number; source: string }
  | { ok: false; error: string; failures: TipFailure[] };

export const PUBLIC_TIP_SOURCES = [
  {
    name: "mempool.space",
    url: "https://mempool.space/api/blocks/tip/height",
  },
  {
    name: "blockstream.info",
    url: "https://blockstream.info/api/blocks/tip/height",
  },
  {
    name: "mempool.emzy.de",
    url: "https://mempool.emzy.de/api/blocks/tip/height",
  },
] as const;

const DEFAULT_TIMEOUT_MS = 8_000;

export function formatTipError(failures: TipFailure[]): string {
  if (failures.length === 0) {
    return "Could not fetch block height from any public explorer.";
  }
  return failures.map((f) => `${f.source}: ${f.reason}`).join(" · ");
}

function reasonFromError(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && err.name === "AbortError") {
    return "timed out";
  }
  if (err instanceof Error) {
    const msg = err.message.replace(/^Error:\s*/, "");
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ECONNRESET|certificate/i.test(msg)) {
      return msg;
    }
    return msg || "request failed";
  }
  return String(err);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "track-prefix/0.1" },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPublicChainTip(opts?: {
  timeoutMs?: number;
}): Promise<PublicTipResult> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const failures: TipFailure[] = [];

  for (const source of PUBLIC_TIP_SOURCES) {
    try {
      const res = await fetchWithTimeout(source.url, timeoutMs);
      if (!res.ok) {
        failures.push({ source: source.name, reason: `HTTP ${res.status}` });
        continue;
      }
      const text = (await res.text()).trim();
      const height = parseInt(text, 10);
      if (!Number.isFinite(height) || height <= 0) {
        failures.push({
          source: source.name,
          reason: `invalid height "${text.slice(0, 40)}"`,
        });
        continue;
      }
      return { ok: true, height, source: source.name };
    } catch (err) {
      failures.push({ source: source.name, reason: reasonFromError(err) });
    }
  }

  return {
    ok: false,
    error: formatTipError(failures),
    failures,
  };
}
