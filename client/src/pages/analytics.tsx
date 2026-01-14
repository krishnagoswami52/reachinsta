import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DurationChart } from "@/components/dashboard/charts/duration-chart";
import { LeaderboardChart } from "@/components/dashboard/charts/leaderboard-chart";
import { HeatmapChart } from "@/components/dashboard/charts/heatmap-chart";
import { DurationScatterChart } from "@/components/dashboard/charts/scatter-chart";
import { ViralReelsTable } from "@/components/dashboard/viral-reels-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BarChart3 } from "lucide-react";
import type { FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: latestFetch } = useQuery<{ fetchRun: FetchRun; reels: Reel[]; stats: CompetitorStats[] } | null>({
    queryKey: ["/api/fetch/latest"],
  });

  const reels = latestFetch?.reels || [];
  const stats = latestFetch?.stats || [];
  const hasData = reels.length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Analytics
        </h1>
        <p className="text-muted-foreground">Deep dive into your competitor performance data</p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No Analytics Data"
          description="Run a fetch from the dashboard to start analyzing competitor Reels performance."
        />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="overview" data-testid="analytics-tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="viral" data-testid="analytics-tab-viral">Viral Reels</TabsTrigger>
            <TabsTrigger value="timing" data-testid="analytics-tab-timing">Timing</TabsTrigger>
            <TabsTrigger value="duration" data-testid="analytics-tab-duration">Duration</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <LeaderboardChart stats={stats} />
              <HeatmapChart reels={reels} />
            </div>
          </TabsContent>

          <TabsContent value="viral" className="mt-6">
            <ViralReelsTable reels={reels} />
          </TabsContent>

          <TabsContent value="timing" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <HeatmapChart reels={reels} metric="views" />
              <HeatmapChart reels={reels} metric="engagement" />
            </div>
          </TabsContent>

          <TabsContent value="duration" className="space-y-6 mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <DurationChart reels={reels} />
              <DurationScatterChart reels={reels} />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
