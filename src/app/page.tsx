"use client";

import { useEffect, useState } from "react";
import { Header } from "@/ui/header";
import { SeriesCards } from "@/ui/series-cards";
import { NextTarget } from "@/ui/next-target";
import { TraceProgress } from "@/ui/trace-progress";
import { SeriesDetail } from "@/ui/series-detail";
import { ActivityFeed } from "@/ui/activity-feed";
import { Wizard } from "@/ui/wizard";
import { JobLibrary } from "@/ui/job-library";
import { ModeInfoBanner } from "@/ui/mode-info";
import { InscriptionProgress } from "@/ui/inscription-progress";
import { SnapshotExport } from "@/ui/snapshot-export";
import type { DataMode } from "@/core/job-config";

type BootState =
  | { status: "loading" }
  | {
      status: "wizard";
      modeAvailability: Record<DataMode, "ready" | "coming_soon">;
    }
  | {
      status: "picker";
      modeAvailability: Record<DataMode, "ready" | "coming_soon">;
    }
  | { status: "dashboard" };

export default function Page() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });
  const [showWizard, setShowWizard] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [modeAvailability, setModeAvailability] = useState<
    Record<DataMode, "ready" | "coming_soon">
  >({
    public_api: "ready",
    paid_api: "ready",
    btc_node: "ready",
    btc_ord: "ready",
  });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        const json = await res.json();
        if (json.modeAvailability) setModeAvailability(json.modeAvailability);
        if (json.storageHealed) {
          setStorageNotice(
            "Job files under data/jobs/ were missing. An empty folder was recreated so the dashboard can load, but prior UTXO progress is gone."
          );
        }
        const jobs = json.jobs ?? [];
        const hasJobs = jobs.length > 0;
        const hasActive =
          json.config?.wizardComplete &&
          json.config?.job &&
          json.config?.activeJobId;

        if (hasActive) {
          setBoot({ status: "dashboard" });
        } else if (hasJobs) {
          setBoot({
            status: "picker",
            modeAvailability: json.modeAvailability,
          });
        } else if (json.config?.wizardComplete && json.config?.job) {
          setBoot({ status: "dashboard" });
        } else {
          setBoot({
            status: "wizard",
            modeAvailability: json.modeAvailability,
          });
        }
      } catch {
        setBoot({
          status: "wizard",
          modeAvailability: {
            public_api: "ready",
            paid_api: "ready",
            btc_node: "ready",
            btc_ord: "ready",
          },
        });
      }
    })();
  }, []);

  if (boot.status === "loading") {
    return (
      <main className="p-6 text-terminal-dim text-sm">Loading track-prefix…</main>
    );
  }

  if (showWizard || boot.status === "wizard") {
    return (
      <Wizard
        modeAvailability={modeAvailability}
        onCancel={
          boot.status !== "wizard" ? () => setShowWizard(false) : undefined
        }
      />
    );
  }

  if (boot.status === "picker") {
    return (
      <main className="max-w-3xl mx-auto p-6 space-y-6">
        <h1 className="text-terminal-green text-2xl font-bold tracking-wider">
          track-prefix
        </h1>
        <p className="text-sm text-terminal-dim">
          Choose a tracked prefix series to open, or start a new one.
        </p>
        <JobLibrary onNewTrack={() => setShowWizard(true)} />
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {storageNotice && (
          <div className="text-xs border border-terminal-amber/40 p-3 space-y-2">
            <p className="text-terminal-amber">{storageNotice}</p>
            <p className="text-terminal-dim">
              Recommended: start a <strong>New track</strong> (wizard) for a
              clean job, or Remove the broken entry from TRACKED JOBS. You can
              also Start on this empty job if you want to reuse it.
            </p>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className="px-3 py-1 border border-terminal-green text-terminal-green"
                onClick={() => setShowWizard(true)}
              >
                + New track
              </button>
              <button
                type="button"
                className="px-3 py-1 border border-terminal-border text-terminal-dim"
                onClick={() => setStorageNotice(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <JobLibrary compact onNewTrack={() => setShowWizard(true)} />
        <ModeInfoBanner />
        <SeriesCards />
        <NextTarget />
        <TraceProgress onNewTrack={() => setShowWizard(true)} />
        <InscriptionProgress />
        <SnapshotExport />
        <SeriesDetail />
        <ActivityFeed />
      </main>
    </div>
  );
}
