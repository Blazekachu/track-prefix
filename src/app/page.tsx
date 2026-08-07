import { Header } from "@/ui/header";
import { SeriesCards } from "@/ui/series-cards";
import { NextTarget } from "@/ui/next-target";
import { TraceProgress } from "@/ui/trace-progress";
import { SeriesDetail } from "@/ui/series-detail";
import { ActivityFeed } from "@/ui/activity-feed";

export default function Dashboard() {
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
