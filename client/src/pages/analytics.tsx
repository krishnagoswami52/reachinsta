import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DurationChart } from "@/components/dashboard/charts/duration-chart";
import { LeaderboardChart } from "@/components/dashboard/charts/leaderboard-chart";
import { HeatmapChart } from "@/components/dashboard/charts/heatmap-chart";
import { DurationScatterChart } from "@/components/dashboard/charts/scatter-chart";
import { ViralReelsTable } from "@/components/dashboard/viral-reels-table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BarChart3, Calendar, Clock, Users, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { FetchRun, Reel, CompetitorStats } from "@shared/schema";

function formatDate(date: string | Date | null): string {
  if (!date) return "N/A";
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: string | Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "failed":
      return <XCircle className="w-4 h-4 text-red-500" />;
    case "running":
    case "queued":
    case "merging":
    case "analyzing":
      return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
    default:
      return null;
  }
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedFetchId, setSelectedFetchId] = useState<string | null>(null);

  const { data: fetchHistory = [] } = useQuery<FetchRun[]>({
    queryKey: ["/api/fetch/history"],
  });

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
  const reels = fetchData?.reels || [];
  const stats = fetchData?.stats || [];
  const hasData = reels.length > 0;

  const totalViews = reels.reduce((sum, r) => sum + r.views, 0);
  const avgEngagement = reels.length > 0
    ? reels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / reels.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            Analytics
          </h1>
          <p className="text-muted-foreground">Browse and analyze your past fetch history</p>
        </div>

        {completedFetches.length > 0 && (
          <Select
            value={selectedFetchId || ""}
            onValueChange={setSelectedFetchId}
          >
            <SelectTrigger className="w-full lg:w-[320px]" data-testid="select-fetch-history">
              <SelectValue placeholder="Select a fetch to analyze" />
            </SelectTrigger>
            <SelectContent>
              {completedFetches.map((fetch) => (
                <SelectItem key={fetch.id} value={fetch.id} data-testid={`fetch-option-${fetch.id}`}>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>{formatDate(fetch.createdAt)}</span>
                    <span className="text-muted-foreground">at</span>
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span>{formatTime(fetch.createdAt)}</span>
                    <Badge variant="outline" className="ml-1">{fetch.timeRangeDays}d</Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {completedFetches.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No Analytics Data"
          description="Run a fetch from the dashboard to start analyzing competitor Reels performance."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {selectedFetch && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  Fetch Details
                  {getStatusIcon(selectedFetch.status)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{formatDate(selectedFetch.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time</p>
                    <p className="font-medium">{formatTime(selectedFetch.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Time Range</p>
                    <p className="font-medium">{selectedFetch.timeRangeDays} days</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Competitors</p>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">
                        {selectedFetch.competitorUsernames?.length || 0}
                      </span>
                    </div>
                  </div>
                </div>
                {selectedFetch.competitorUsernames && selectedFetch.competitorUsernames.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm text-muted-foreground mb-2">Tracked Accounts</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedFetch.competitorUsernames.map((username) => (
                        <Badge key={username} variant="secondary">
                          @{username}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Total Reels</p>
                <p className="text-2xl font-bold">{reels.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Total Views</p>
                <p className="text-2xl font-bold">{formatNumber(totalViews)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Avg Engagement</p>
                <p className="text-2xl font-bold">{(avgEngagement * 100).toFixed(2)}%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">Competitors</p>
                <p className="text-2xl font-bold">{stats.length}</p>
              </CardContent>
            </Card>
          </div>

          {!hasData ? (
            <EmptyState
              icon={BarChart3}
              title="No Data for This Fetch"
              description="This fetch didn't return any reels data."
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
        </>
      )}
    </div>
  );
}
