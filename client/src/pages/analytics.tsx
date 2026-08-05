import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { CreatorERChart } from "@/components/dashboard/charts/creator-er-chart";
import { DurationBucketChart } from "@/components/dashboard/charts/duration-bucket-chart";
import { VRDistributionChart } from "@/components/dashboard/charts/vr-distribution-chart";
import { ERByHourChart } from "@/components/dashboard/charts/er-by-hour-chart";
import { ERByWeekdayChart } from "@/components/dashboard/charts/er-by-weekday-chart";
import { TopReelsTable } from "@/components/dashboard/charts/top-reels-table";
import { DurationChart } from "@/components/dashboard/charts/duration-chart";
import { LeaderboardChart } from "@/components/dashboard/charts/leaderboard-chart";
import { HeatmapChart } from "@/components/dashboard/charts/heatmap-chart";
import { DurationScatterChart } from "@/components/dashboard/charts/scatter-chart";
import { ViralReelsTable } from "@/components/dashboard/viral-reels-table";
import { QuickTips } from "@/components/dashboard/quick-tips";
import { MetricsNotes } from "@/components/dashboard/metrics-notes";
import { EmptyState } from "@/components/dashboard/empty-state";

import { BarChart3, Calendar, Clock, Users, CheckCircle2, XCircle, Loader2, TrendingUp, Eye, ChevronDown } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { FetchRun, Reel, CompetitorStats } from "@shared/schema";

function formatDate(date: string | Date | null): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(date: string | Date | null): string {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed": return <CheckCircle2 className="w-4 h-4 text-mint" strokeWidth={1.5} />;
    case "failed":    return <XCircle className="w-4 h-4 text-danger" strokeWidth={1.5} />;
    case "running":
    case "queued":
    case "merging":
    case "analyzing": return <Loader2 className="w-4 h-4 animate-spin text-text-muted" strokeWidth={1.5} />;
    default: return null;
  }
}

export default function AnalyticsPage() {
  useEffect(() => { document.title = "Analytics - ReachInsta"; }, []);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFetchId, setSelectedFetchId] = useState<string | null>(null);

  const { data: fetchHistory = [] } = useQuery<FetchRun[]>({ queryKey: ["/api/fetch/history"] });
  const completedFetches = fetchHistory.filter(f => f.status === "completed");

  useEffect(() => {
    if (completedFetches.length > 0 && !selectedFetchId) {
      setSelectedFetchId(completedFetches[0].id);
    }
  }, [completedFetches, selectedFetchId]);

  const { data: fetchData, isLoading } = useQuery<{ fetchRun: FetchRun; reels: Reel[]; stats: CompetitorStats[] } | null>({
    queryKey: ["/api/fetch", selectedFetchId],
    enabled: !!selectedFetchId,
  });

  const selectedFetch = fetchData?.fetchRun;
  const reels  = fetchData?.reels  || [];
  const stats  = fetchData?.stats  || [];
  const hasData = reels.length > 0;

  // Zero-view reels are scrape failures (missing videoPlayCount), not real data —
  // they carry ER=0 and drag every average down. Excluded from all aggregations.
  const validReels = useMemo(
    () => reels.filter(r => r.views > 0),
    [reels]
  );

  const totalViews    = validReels.reduce((sum, r) => sum + r.views, 0);
  const avgViews      = validReels.length > 0 ? totalViews / validReels.length : 0;
  const avgEngagement = validReels.length > 0
    ? validReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / validReels.length : 0;
  const topViews = validReels.length > 0 ? Math.max(...validReels.map(r => r.views)) : 0;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-6 h-6 text-text-secondary" strokeWidth={1.5} />
            <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary">
              Analytics
            </h1>
          </div>
          <p className="text-[15px] text-text-secondary">
            Deep dive into competitor performance data.
          </p>
        </div>

        {/* Fetch selector */}
        {completedFetches.length > 0 && (
          <div className="bg-bg-surface border border-border-subtle rounded-lg px-4 py-2.5 flex items-center gap-2">
            <Select value={selectedFetchId || ""} onValueChange={setSelectedFetchId}>
              <SelectTrigger className="w-full lg:w-[300px] border-0 bg-transparent p-0 h-auto font-mono text-[13px] text-text-primary focus:ring-0" data-testid="select-fetch-history">
                <div className="flex items-center gap-3">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                  <SelectValue placeholder="Select a fetch to analyze" />
                  <ChevronDown className="w-3.5 h-3.5 text-text-muted ml-auto" strokeWidth={1.5} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {completedFetches.map((fetch) => (
                  <SelectItem key={fetch.id} value={fetch.id} data-testid={`fetch-option-${fetch.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[13px]">{formatDate(fetch.createdAt)}</span>
                      <span className="text-text-muted text-[12px]">at</span>
                      <span className="font-mono text-[13px]">{formatTime(fetch.createdAt)}</span>
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-bg-elevated border border-border-subtle text-text-muted ml-1">
                        {fetch.timeRangeDays}d
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {completedFetches.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics data."
          description="Run a fetch from the dashboard to start analyzing competitor Reels performance."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-text-muted" strokeWidth={1.5} />
        </div>
      ) : (
        <>
          {/* Fetch details card */}
          {selectedFetch && (
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 mb-6">
              <div className="flex items-center gap-2 mb-6">
                <h2 className="font-tight font-semibold text-[18px] text-text-primary">Fetch Details</h2>
                {getStatusIcon(selectedFetch.status)}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                    // DATE
                  </div>
                  <div className="font-mono text-[15px] text-text-primary">{formatDate(selectedFetch.createdAt)}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                    // TIME
                  </div>
                  <div className="font-mono text-[15px] text-text-primary">{formatTime(selectedFetch.createdAt)}</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                    // TIME RANGE
                  </div>
                  <div className="font-mono text-[15px] text-text-primary">{selectedFetch.timeRangeDays} days</div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                    // COMPETITORS
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-text-secondary" strokeWidth={1.5} />
                    <span className="font-mono text-[15px] text-text-primary">
                      {selectedFetch.competitorUsernames?.length || stats.length}
                    </span>
                  </div>
                </div>
              </div>

              {selectedFetch.competitorUsernames && selectedFetch.competitorUsernames.length > 0 && (
                <div className="pt-5 border-t border-border-subtle">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-3">
                    // TRACKED ACCOUNTS
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedFetch.competitorUsernames.map((username) => (
                      <span
                        key={username}
                        className="font-mono text-[12px] px-3 py-1.5 rounded-md bg-bg-base border border-border-subtle text-text-primary"
                      >
                        @{username}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5-card stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-8">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors">
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">total reels</span>
              </div>
              <div className="font-mono text-[32px] font-medium text-text-primary tracking-tight">{reels.length}</div>
              {reels.length > validReels.length && (
                <div className="font-mono text-[10px] text-text-muted mt-1">
                  {reels.length - validReels.length} excluded (no view data)
                </div>
              )}
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors">
              <div className="flex items-center gap-1.5 mb-3">
                <Eye className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">total views</span>
              </div>
              <div className="font-mono text-[32px] font-medium text-text-primary tracking-tight">{formatNumber(totalViews)}</div>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors">
              <div className="flex items-center gap-1.5 mb-3">
                <Eye className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">avg views</span>
              </div>
              <div className="font-mono text-[32px] font-medium text-text-primary tracking-tight">{formatNumber(Math.round(avgViews))}</div>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-mint" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">avg er</span>
              </div>
              <div className="font-mono text-[32px] font-medium text-mint tracking-tight">
                {(avgEngagement * 100).toFixed(2)}%
              </div>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors">
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">top views</span>
              </div>
              <div className="font-mono text-[32px] font-medium text-text-primary tracking-tight">{formatNumber(topViews)}</div>
            </div>
          </div>

          {!hasData ? (
            <EmptyState icon={BarChart3} title="No data for this fetch." description="This fetch didn't return any reels data." />
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overview"  data-testid="analytics-tab-overview">Overview</TabsTrigger>
                <TabsTrigger value="creators"  data-testid="analytics-tab-creators">Creators</TabsTrigger>
                <TabsTrigger value="timing"    data-testid="analytics-tab-timing">Timing</TabsTrigger>
                <TabsTrigger value="duration"  data-testid="analytics-tab-duration">Duration</TabsTrigger>
                <TabsTrigger value="reels"     data-testid="analytics-tab-reels">Reels</TabsTrigger>
                <TabsTrigger value="tips"      data-testid="analytics-tab-tips">Tips</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-6 mt-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <CreatorERChart stats={stats} />
                  <LeaderboardChart stats={stats} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <HeatmapChart reels={validReels} />
                  <DurationBucketChart reels={validReels} />
                </div>
              </TabsContent>

              <TabsContent value="creators" className="space-y-6 mt-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <CreatorERChart stats={stats} />
                  <LeaderboardChart stats={stats} />
                </div>
                <ViralReelsTable reels={validReels} />
              </TabsContent>

              <TabsContent value="timing" className="space-y-6 mt-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <ERByHourChart reels={validReels} />
                  <ERByWeekdayChart reels={validReels} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <HeatmapChart reels={validReels} metric="views" />
                  <HeatmapChart reels={validReels} metric="engagement" />
                </div>
              </TabsContent>

              <TabsContent value="duration" className="space-y-6 mt-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <DurationBucketChart reels={validReels} />
                  <DurationChart reels={validReels} />
                </div>
                <div className="grid lg:grid-cols-2 gap-6">
                  <DurationScatterChart reels={validReels} />
                  <VRDistributionChart reels={validReels} />
                </div>
              </TabsContent>

              <TabsContent value="reels" className="space-y-6 mt-6">
                <div className="grid lg:grid-cols-2 gap-6">
                  <TopReelsTable reels={validReels} sortBy="views" />
                  <TopReelsTable reels={validReels} sortBy="engagement" />
                </div>
                <ViralReelsTable reels={validReels} />
              </TabsContent>

              <TabsContent value="tips" className="space-y-6 mt-6">
                <QuickTips reels={validReels} stats={stats} timeRangeDays={selectedFetch?.timeRangeDays || 7} />
                <MetricsNotes />
                <p className="font-mono text-[11px] text-text-muted text-center">
                  Numbers update in real-time after each fetch. No cache.
                </p>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </div>
  );
}
