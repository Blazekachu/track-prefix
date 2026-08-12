"use client";

import { useEffect, useMemo, useState } from "react";
import type { JobSummary } from "@/ui/job-library";

type JobsResponse = {
  activeJobId: string | null;
  jobs: JobSummary[];
};

type ExportResponse = {
  ok: boolean;
  outputPath: string;
  format: string;
  summary: {
    series: number;
    utxos: number;
    inscriptions: number;
    snapshotBlockHeight: number;
  };
};

export function SnapshotExport() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/jobs");
        const json = (await res.json()) as JobsResponse;
        if (!res.ok) {
          setError("Failed to load tracked jobs.");
          return;
        }
        setJobs(json.jobs ?? []);
        setActiveJobId(json.activeJobId ?? null);
        setSelectedJobId((prev) => prev || json.activeJobId || json.jobs?.[0]?.id || "");
        setError(null);
      } catch {
        setError("Failed to load tracked jobs.");
      }
    };
    void load();
  }, []);

  const selectableJobs = useMemo(
    () => jobs.filter((j) => !j.storageMissing),
    [jobs]
  );

  async function exportSelected() {
    if (!selectedJobId) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/snapshot/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: selectedJobId }),
      });
      const json = (await res.json()) as ExportResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Failed to export snapshot.");
      }
      setMsg(
        `Exported JSON snapshot to ${json.outputPath} · series ${json.summary.series}, UTXOs ${json.summary.utxos}, inscriptions ${json.summary.inscriptions}, block ${json.summary.snapshotBlockHeight}.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (jobs.length === 0) {
    return null;
  }

  return (
    <section className="border border-terminal-border rounded p-4 bg-terminal-surface text-sm space-y-3">
      <h2 className="text-terminal-dim text-xs tracking-widest">
        SNAPSHOT EXPORT
      </h2>
      <p className="text-terminal-dim text-xs">
        Choose a tracked DB, then export a fresh <strong>JSON</strong> snapshot
        (`tracker-data.json`) for that job.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-terminal-dim min-w-[260px]">
          Track DB
          <select
            value={selectedJobId}
            onChange={(e) => setSelectedJobId(e.target.value)}
            className="bg-black border border-terminal-border text-terminal-bright px-2 py-1"
          >
            {selectableJobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.prefix} · series {job.seriesId}
                {job.id === activeJobId ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void exportSelected()}
          disabled={busy || !selectedJobId}
          className="px-3 py-1 border border-terminal-green text-terminal-green hover:bg-terminal-green/10 disabled:opacity-50"
        >
          {busy ? "Exporting..." : "Export snapshot"}
        </button>
      </div>

      {error && <p className="text-terminal-red text-xs">{error}</p>}
      {msg && <p className="text-terminal-dim text-xs">{msg}</p>}
    </section>
  );
}
