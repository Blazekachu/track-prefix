import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  saveConfig,
  loadConfig,
  type TrackPrefixConfig,
} from "./job-config";
import {
  createJob,
  getActiveDbPath,
  listJobSummaries,
  loadRegistry,
  setActiveJob,
  registryPath,
  jobsRoot,
} from "./job-library";
import { shouldBlockNewTrack } from "./job-policy";

describe("job-library", () => {
  let dir: string;
  let origCwd: string;

  beforeEach(() => {
    origCwd = process.cwd();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "tp-jobs-"));
    process.chdir(dir);
    process.env.TRACK_PREFIX_CONFIG = path.join(dir, "config.json");
  });

  afterEach(() => {
    process.chdir(origCwd);
    delete process.env.TRACK_PREFIX_CONFIG;
    delete process.env.DATABASE_PATH;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const sampleJob = {
    prefix: "exquisite",
    seriesId: 1,
    nameLength: 9,
    satStart: "1000",
    satEnd: "2000",
    satCount: "676",
    tipHeightAtStart: 900000,
  };

  it("creates job folder and registry entry", () => {
    saveConfig({
      version: 1,
      wizardComplete: false,
      mode: "public_api",
      modeCredentials: {},
      job: null,
    });
    const entry = createJob({ job: sampleJob, mode: "public_api" });
    expect(fs.existsSync(path.join(jobsRoot(), entry.id, "track.db"))).toBe(
      false
    );
    expect(fs.existsSync(path.join(jobsRoot(), entry.id))).toBe(true);
    const reg = loadRegistry();
    expect(reg.jobs).toHaveLength(1);
    expect(reg.jobs[0].id).toBe(entry.id);
    expect(loadConfig()?.activeJobId).toBe(entry.id);
  });

  it("getActiveDbPath points at active job db", () => {
    saveConfig({
      version: 1,
      wizardComplete: false,
      mode: "public_api",
      modeCredentials: {},
      job: null,
    });
    const entry = createJob({ job: sampleJob, mode: "public_api" });
    expect(getActiveDbPath()).toBe(
      path.join(jobsRoot(), entry.id, "track.db")
    );
  });

  it("setActiveJob switches active config job", () => {
    saveConfig({
      version: 1,
      wizardComplete: false,
      mode: "public_api",
      modeCredentials: {},
      job: null,
    });
    const a = createJob({ job: sampleJob, mode: "public_api" });
    const b = createJob({
      job: { ...sampleJob, prefix: "bhang", seriesId: 2 },
      mode: "public_api",
    });
    setActiveJob(a.id);
    expect(loadConfig()?.job?.prefix).toBe("exquisite");
    setActiveJob(b.id);
    expect(loadConfig()?.job?.prefix).toBe("bhang");
    expect(loadConfig()?.activeJobId).toBe(b.id);
  });

  it("migrates legacy config.json + track-prefix.db", () => {
    const cfg: TrackPrefixConfig = {
      version: 1,
      wizardComplete: true,
      mode: "public_api",
      modeCredentials: {},
      job: sampleJob,
    };
    fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify(cfg));
    fs.writeFileSync(path.join(dir, "track-prefix.db"), "legacy-db-marker");

    loadRegistry();

    expect(fs.existsSync(registryPath())).toBe(true);
    const reg = loadRegistry();
    expect(reg.jobs).toHaveLength(1);
    expect(reg.jobs[0].prefix).toBe("exquisite");
    const migratedDb = path.join(
      jobsRoot(),
      reg.jobs[0].id,
      "track.db"
    );
    expect(fs.readFileSync(migratedDb, "utf8")).toBe("legacy-db-marker");
    expect(loadConfig()?.activeJobId).toBe(reg.jobs[0].id);
  });

  it("listJobSummaries marks active job", () => {
    saveConfig({
      version: 1,
      wizardComplete: false,
      mode: "public_api",
      modeCredentials: {},
      job: null,
    });
    const entry = createJob({ job: sampleJob, mode: "public_api" });
    const summaries = listJobSummaries();
    expect(summaries[0].isActive).toBe(true);
    expect(summaries[0].id).toBe(entry.id);
  });
});
