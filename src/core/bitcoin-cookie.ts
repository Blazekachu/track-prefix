import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type BitcoinCookieAuth = {
  rpcUser: string;
  rpcPassword: string;
  cookiePath: string;
};

/** Default Bitcoin Core cookie locations (mainnet). */
export function defaultBitcoinCookiePaths(): string[] {
  const home = os.homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    return [path.join(appData, "Bitcoin", ".cookie")];
  }
  if (process.platform === "darwin") {
    return [
      path.join(home, "Library", "Application Support", "Bitcoin", ".cookie"),
      path.join(home, ".bitcoin", ".cookie"),
    ];
  }
  return [path.join(home, ".bitcoin", ".cookie")];
}

/**
 * Parse Bitcoin Core cookie file contents (`user:password`).
 * Password may contain colons — only split on the first `:`.
 */
export function parseBitcoinCookie(contents: string): {
  rpcUser: string;
  rpcPassword: string;
} {
  const raw = contents.replace(/^\uFEFF/, "").trim();
  const idx = raw.indexOf(":");
  if (idx <= 0 || idx === raw.length - 1) {
    throw new Error(
      "Cookie file is not in the expected user:password format."
    );
  }
  return {
    rpcUser: raw.slice(0, idx),
    rpcPassword: raw.slice(idx + 1),
  };
}

export function readBitcoinCookie(
  cookiePath?: string
): BitcoinCookieAuth {
  const candidates = cookiePath?.trim()
    ? [cookiePath.trim()]
    : defaultBitcoinCookiePaths();

  const tried: string[] = [];
  for (const p of candidates) {
    tried.push(p);
    if (!fs.existsSync(p)) continue;
    try {
      const contents = fs.readFileSync(p, "utf8");
      const parsed = parseBitcoinCookie(contents);
      return { ...parsed, cookiePath: p };
    } catch (err) {
      if (err instanceof Error && /expected user:password/.test(err.message)) {
        throw err;
      }
      throw new Error(
        `Could not read Bitcoin cookie at ${p}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  throw new Error(
    `Bitcoin cookie not found. Looked for: ${tried.join(", ")}. ` +
      "Start bitcoind (or paste the full path to .cookie), or enter RPC user/password from bitcoin.conf."
  );
}
