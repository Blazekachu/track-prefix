import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  saveConfig,
  loadConfig,
  type TrackPrefixConfig,
} from "./job-config";

describe("job-config", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tp-cfg-"));

  beforeEach(() => {
    process.env.TRACK_PREFIX_CONFIG = path.join(dir, "config.json");
    const p = process.env.TRACK_PREFIX_CONFIG;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  afterEach(() => {
    delete process.env.TRACK_PREFIX_CONFIG;
  });

  it("round-trips config", () => {
    const cfg: TrackPrefixConfig = {
      version: 1,
      wizardComplete: true,
      mode: "public_api",
      modeCredentials: {},
      job: {
        prefix: "bhang",
        seriesId: 1,
        nameLength: 11,
        satStart: "1773906020861562",
        satEnd: "1773906329777337",
        satCount: "308915776",
        tipHeightAtStart: 900000,
      },
    };
    saveConfig(cfg);
    expect(loadConfig()).toEqual(cfg);
  });

  it("returns null when missing", () => {
    expect(loadConfig()).toBeNull();
  });
});
