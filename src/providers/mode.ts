import type { DataMode } from "@/core/job-config";
import { getEsploraBases } from "./esplora-client";

export type ModeCredentials = {
  rpcUrl?: string;
  rpcUser?: string;
  rpcPassword?: string;
  ordUrl?: string;
  apiBaseUrl?: string;
  apiKey?: string;
};

/** Resolve Esplora base URLs for public/paid API modes only. */
export function resolveEsploraBases(input: {
  mode: DataMode;
  modeCredentials: ModeCredentials;
}): string[] {
  if (input.mode === "public_api") {
    return getEsploraBases();
  }
  if (input.mode === "paid_api") {
    const base = input.modeCredentials.apiBaseUrl?.trim().replace(/\/+$/, "");
    if (!base) {
      throw new Error("paid_api requires modeCredentials.apiBaseUrl");
    }
    return [base];
  }
  throw new Error(
    `Mode ${input.mode} does not use Esplora — use createProvider() instead.`
  );
}

export function validateModeCredentials(input: {
  mode: DataMode;
  modeCredentials: ModeCredentials;
}): void {
  if (input.mode === "paid_api") {
    if (!input.modeCredentials.apiBaseUrl?.trim()) {
      throw new Error("paid_api requires modeCredentials.apiBaseUrl");
    }
    return;
  }
  if (input.mode === "btc_node" || input.mode === "btc_ord") {
    if (!input.modeCredentials.rpcUrl?.trim()) {
      throw new Error(`${input.mode} requires RPC URL`);
    }
    if (!input.modeCredentials.rpcUser?.trim()) {
      throw new Error(`${input.mode} requires RPC user`);
    }
    if (!input.modeCredentials.rpcPassword) {
      throw new Error(
        `${input.mode} requires RPC password (from bitcoin.conf or .cookie)`
      );
    }
    if (input.mode === "btc_ord" && !input.modeCredentials.ordUrl?.trim()) {
      throw new Error("btc_ord requires ord URL");
    }
  }
}
