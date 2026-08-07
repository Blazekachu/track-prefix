import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import {
  loadConfig,
  saveConfig,
  type DataMode,
  type TrackJob,
  type TrackPrefixConfig,
} from "./job-config";
import { isPidAlive } from "./pid";

export interface JobEntry {
  id: string;
  prefix: string;
  seriesId: number;
  nameLength: number;
  satStart: string;
  satEnd: string;
  satCount: string;
  tipHeightAtStart: number;
  /** Mode recorded when the job was created (informational). */
  mode: DataMode;
  createdAt: string;
  lastOpenedAt: string;
  /** Relative folder under project root, e.g. data/jobs/exquisite-s1 */
  folder: string;
}

export interface JobRegistry {
  version: 1;
  jobs: JobEntry[];
}

export interface JobSummary extends JobEntry {
  dbPath: string;
  traceStatus: string | null;
  lastRun: string | null;
  queueSize: number;
  isRunning: boolean;
  isActive: boolean;
}

const DATA_DIR = "data";
const JOBS_DIR = path.join(DATA_DIR, "jobs");
const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");

export function dataDir(): string {
  return path.resolve(process.cwd(), DATA_DIR);
}

export function jobsRoot(): string {
  return path.resolve(process.cwd(), JOBS_DIR);
}

export function registryPath(): string {
  return path.resolve(process.cwd(), REGISTRY_FILE);
}

export function jobFolder(id: string): string {
  return path.join(jobsRoot(), id);
}

export function jobDbPath(entry: JobEntry): string {
  return path.join(path.resolve(process.cwd(), entry.folder), "track.db");
}

export function jobLockPath(entry: JobEntry): string {
  return `${jobDbPath(entry)}.trace.lock`;
}

export function jobControlPath(entry: JobEntry): string {
  return `${jobDbPath(entry)}.trace.control`;
}

export function jobProviderHealthPath(entry: JobEntry): string {
  return path.join(path.resolve(process.cwd(), entry.folder), "provider-health.json");
}

export function jobSnapshotPath(entry: JobEntry): string {
  return path.join(path.resolve(process.cwd(), entry.folder), "tracker-data.json");
}

function ensureDirs(): void {
  fs.mkdirSync(jobsRoot(), { recursive: true });
}

function slugify(prefix: string, seriesId: number): string {
  const base = `${prefix}-s${seriesId}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return base || `job-s${seriesId}`;
}

function uniqueJobId(prefix: string, seriesId: number, jobs: JobEntry[]): string {
  const base = slugify(prefix, seriesId);
  if (!jobs.some((j) => j.id === base)) return base;
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let id = `${base}-${stamp}`;
  let n = 2;
  while (jobs.some((j) => j.id === id)) {
    id = `${base}-${stamp}-${n}`;
    n++;
  }
  return id;
}

export function loadRegistry(): JobRegistry {
  ensureDirs();
  migrateLegacyIfNeeded();
  const p = registryPath();
  if (!fs.existsSync(p)) {
    return { version: 1, jobs: [] };
  }
  return JSON.parse(fs.readFileSync(p, "utf8")) as JobRegistry;
}

export function saveRegistry(reg: JobRegistry): void {
  ensureDirs();
  fs.writeFileSync(registryPath(), JSON.stringify(reg, null, 2), "utf8");
}

export function getJobById(id: string): JobEntry | null {
  return loadRegistry().jobs.find((j) => j.id === id) ?? null;
}

export function getActiveJobEntry(): JobEntry | null {
  const cfg = loadConfig();
  if (!cfg?.activeJobId) return null;
  return getJobById(cfg.activeJobId);
}

export function getActiveDbPath(): string {
  const entry = getActiveJobEntry();
  if (entry) return jobDbPath(entry);
  return path.resolve(process.cwd(), process.env.DATABASE_PATH || "./track-prefix.db");
}

/** Read trace status from a job DB without going through getDb seeding. */
function readJobTraceMeta(dbPath: string): {
  traceStatus: string | null;
  lastRun: string | null;
  queueSize: number;
} {
  if (!fs.existsSync(dbPath)) {
    return { traceStatus: null, lastRun: null, queueSize: 0 };
  }
  try {
    const db = new Database(dbPath, { readonly: true });
    const state = db
      .prepare("SELECT status, last_run FROM trace_state WHERE id = 1")
      .get() as { status: string; last_run: string } | undefined;
    const queue = db
      .prepare("SELECT COUNT(*) as cnt FROM trace_queue")
      .get() as { cnt: number };
    db.close();
    return {
      traceStatus: state?.status ?? null,
      lastRun: state?.last_run ?? null,
      queueSize: queue?.cnt ?? 0,
    };
  } catch {
    return { traceStatus: null, lastRun: null, queueSize: 0 };
  }
}

function readLockForEntry(entry: JobEntry): {
  running: boolean;
  pid: number | null;
} {
  try {
    const raw = fs.readFileSync(jobLockPath(entry), "utf8");
    const lock = JSON.parse(raw) as { pid?: number };
    const pid = Number(lock.pid ?? 0);
    return { running: isPidAlive(pid), pid: pid || null };
  } catch {
    return { running: false, pid: null };
  }
}

export function summarizeJob(entry: JobEntry, activeJobId: string | null): JobSummary {
  const dbPath = jobDbPath(entry);
  const meta = readJobTraceMeta(dbPath);
  const lock = readLockForEntry(entry);
  return {
    ...entry,
    dbPath,
    traceStatus: lock.running
      ? meta.traceStatus === "refreshing"
        ? "refreshing"
        : "tracing"
      : meta.traceStatus,
    lastRun: meta.lastRun,
    queueSize: meta.queueSize,
    isRunning: lock.running,
    isActive: entry.id === activeJobId,
  };
}

export function listJobSummaries(): JobSummary[] {
  const reg = loadRegistry();
  const cfg = loadConfig();
  const activeId = cfg?.activeJobId ?? null;
  return reg.jobs
    .map((j) => summarizeJob(j, activeId))
    .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
}

export function findRunningJob(): JobSummary | null {
  return listJobSummaries().find((j) => j.isRunning) ?? null;
}

/** Public/paid API users may only run one tracer globally. */
export function assertSingleTraceAllowed(mode: DataMode): void {
  if (mode !== "public_api" && mode !== "paid_api") return;
  const running = findRunningJob();
  if (running) {
    throw new Error(
      `Only one trace can run at a time on ${mode.replace("_", " ")}. ` +
        `${running.prefix} series ${running.seriesId} is still running. Pause/stop it first.`
    );
  }
}

export function entryToTrackJob(entry: JobEntry): TrackJob {
  return {
    prefix: entry.prefix,
    seriesId: entry.seriesId,
    nameLength: entry.nameLength,
    satStart: entry.satStart,
    satEnd: entry.satEnd,
    satCount: entry.satCount,
    tipHeightAtStart: entry.tipHeightAtStart,
  };
}

export function createJob(input: {
  job: TrackJob;
  mode: DataMode;
}): JobEntry {
  const reg = loadRegistry();
  const id = uniqueJobId(input.job.prefix, input.job.seriesId, reg.jobs);
  const folderRel = path.join(JOBS_DIR, id).replace(/\\/g, "/");
  const folderAbs = path.join(jobsRoot(), id);
  fs.mkdirSync(folderAbs, { recursive: true });

  const now = new Date().toISOString();
  const entry: JobEntry = {
    id,
    ...input.job,
    mode: input.mode,
    createdAt: now,
    lastOpenedAt: now,
    folder: folderRel,
  };

  reg.jobs.push(entry);
  saveRegistry(reg);
  setActiveJob(id);
  return entry;
}

export function setActiveJob(id: string): JobEntry {
  const entry = getJobById(id);
  if (!entry) throw new Error(`Unknown job id: ${id}`);

  if (findRunningJob() && !readLockForEntry(entry).running) {
    throw new Error(
      "Another job's tracer is still running. Pause/stop it before switching jobs."
    );
  }

  const reg = loadRegistry();
  const idx = reg.jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    reg.jobs[idx].lastOpenedAt = new Date().toISOString();
    saveRegistry(reg);
  }

  const cfg = loadConfig();
  const next: TrackPrefixConfig = cfg
    ? { ...cfg, activeJobId: id, wizardComplete: true, job: entryToTrackJob(entry) }
    : {
        version: 1,
        wizardComplete: true,
        mode: entry.mode,
        modeCredentials: {},
        activeJobId: id,
        job: entryToTrackJob(entry),
      };
  saveConfig(next);
  return entry;
}

function migrateLegacyIfNeeded(): void {
  const regPath = registryPath();
  if (fs.existsSync(regPath)) return;

  const cfgPath = path.resolve(process.cwd(), "config.json");
  if (!fs.existsSync(cfgPath)) return;

  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as TrackPrefixConfig;
  if (!cfg.job) return;

  ensureDirs();
  const id = slugify(cfg.job.prefix, cfg.job.seriesId);
  const folderRel = path.join(JOBS_DIR, id).replace(/\\/g, "/");
  const folderAbs = path.join(jobsRoot(), id);
  fs.mkdirSync(folderAbs, { recursive: true });

  const legacyDb = path.resolve(process.cwd(), "track-prefix.db");
  const newDb = path.join(folderAbs, "track.db");
  if (fs.existsSync(legacyDb) && !fs.existsSync(newDb)) {
    fs.copyFileSync(legacyDb, newDb);
    for (const ext of ["-wal", "-shm", "-journal"]) {
      const leg = `${legacyDb}${ext}`;
      const neu = `${newDb}${ext}`;
      if (fs.existsSync(leg)) fs.copyFileSync(leg, neu);
    }
  }

  const legacyHealth = path.resolve(process.cwd(), "provider-health.json");
  const newHealth = path.join(folderAbs, "provider-health.json");
  if (fs.existsSync(legacyHealth) && !fs.existsSync(newHealth)) {
    fs.copyFileSync(legacyHealth, newHealth);
  }

  const now = new Date().toISOString();
  const entry: JobEntry = {
    id,
    prefix: cfg.job.prefix,
    seriesId: cfg.job.seriesId,
    nameLength: cfg.job.nameLength,
    satStart: cfg.job.satStart,
    satEnd: cfg.job.satEnd,
    satCount: cfg.job.satCount,
    tipHeightAtStart: cfg.job.tipHeightAtStart,
    mode: cfg.mode,
    createdAt: now,
    lastOpenedAt: now,
    folder: folderRel,
  };

  saveRegistry({ version: 1, jobs: [entry] });
  saveConfig({ ...cfg, activeJobId: id });
}
