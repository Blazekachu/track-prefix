export type PrefixResult =
  | { ok: true; prefix: string }
  | { ok: false; error: string };

/** Validate a sat-name prefix: lowercase a–z, length 1–11. */
export function validatePrefix(raw: string): PrefixResult {
  const prefix = raw.trim().toLowerCase();
  if (!prefix) return { ok: false, error: "Prefix is required." };
  if (!/^[a-z]+$/.test(prefix)) {
    return { ok: false, error: "Prefix must be lowercase a–z only." };
  }
  if (prefix.length > 11) {
    return { ok: false, error: "Prefix cannot exceed 11 letters." };
  }
  return { ok: true, prefix };
}
