import fs from "fs";
import path from "path";

export type DataMode =
  | "btc_node"
  | "btc_ord"
  | "public_api"
  | "paid_api";

export interface TrackJob {
  prefix: string;
  seriesId: number;
  nameLength: number;
  satStart: string;
  satEnd: string;
  satCount: string;
  tipHeightAtStart: number;
}

export interface TrackPrefixConfig {
  version: 1;
  wizardComplete: boolean;
  mode: DataMode;
  modeCredentials: {
    rpcUrl?: string;
    rpcUser?: string;
    rpcPassword?: string;
    ordUrl?: string;
    apiBaseUrl?: string;
    apiKey?: string;
  };
  /** Modes not yet wired show in UI but cannot be selected to start. */
  modeAvailability?: Partial<Record<DataMode, "ready" | "coming_soon">>;
  /** Active entry in data/registry.json (job library). */
  activeJobId?: string | null;
  job: TrackJob | null;
}

export function configPath(): string {
  return (
    process.env.TRACK_PREFIX_CONFIG ||
    path.resolve(process.cwd(), "config.json")
  );
}

export function loadConfig(): TrackPrefixConfig | null {
  const p = configPath();
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")) as TrackPrefixConfig;
}

export function saveConfig(cfg: TrackPrefixConfig): void {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), "utf8");
}

export function defaultModeAvailability(): Record<
  DataMode,
  "ready" | "coming_soon"
> {
  return {
    public_api: "ready",
    paid_api: "ready",
    btc_node: "coming_soon",
    btc_ord: "coming_soon",
  };
}
