"use client";

import { useEffect, useState } from "react";
import { Header } from "@/ui/header";
import { SeriesCards } from "@/ui/series-cards";
import { NextTarget } from "@/ui/next-target";
import { TraceProgress } from "@/ui/trace-progress";
import { SeriesDetail } from "@/ui/series-detail";
import { ActivityFeed } from "@/ui/activity-feed";
import { Wizard } from "@/ui/wizard";
import type { DataMode } from "@/core/job-config";

type BootState =
  | { status: "loading" }
  | {
      status: "wizard";
      modeAvailability: Record<DataMode, "ready" | "coming_soon">;
    }
  | { status: "dashboard" };

export default function Page() {
  const [boot, setBoot] = useState<BootState>({ status: "loading" });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/config");
        const json = await res.json();
        if (json.config?.wizardComplete && json.config?.job) {
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
            btc_node: "coming_soon",
            btc_ord: "coming_soon",
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

  if (boot.status === "wizard") {
    return <Wizard modeAvailability={boot.modeAvailability} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        <SeriesCards />
        <NextTarget />
        <TraceProgress />
        <SeriesDetail />
        <ActivityFeed />
      </main>
    </div>
  );
}
