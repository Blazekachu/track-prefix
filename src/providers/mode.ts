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

/** Resolve Esplora base URLs for the selected wizard mode. */
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
    `Mode ${input.mode} is coming soon — use public_api or paid_api.`
  );
}
