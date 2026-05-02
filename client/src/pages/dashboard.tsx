import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { KPICard } from "@/components/dashboard/kpi-card";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { FetchStatusStepper } from "@/components/dashboard/fetch-status-stepper";
import { TimeRangeSelector } from "@/components/dashboard/time-range-selector";
import { CompetitorList } from "@/components/dashboard/competitor-list";
import { ViralReelsTable } from "@/components/dashboard/viral-reels-table";
import { DurationChart } from "@/components/dashboard/charts/duration-chart";
import { LeaderboardChart } from "@/components/dashboard/charts/leaderboard-chart";
import { HeatmapChart } from "@/components/dashboard/charts/heatmap-chart";
import { DurationScatterChart } from "@/components/dashboard/charts/scatter-chart";
import { CompetitorCard } from "@/components/dashboard/competitor-card";
import { EmptyState } from "@/components/dashboard/empty-state";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RefreshCw, TrendingUp, Eye, Users, BarChart3, Play, Clock, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { formatNumber, getTimeAgo } from "@/lib/utils";
import type { Profile, Competitor, FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function DashboardPage() {
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState(7);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["/api/competitors"],
  });

  const { data: latestFetch, isLoading: isFetchLoading } = useQuery<{ fetchRun: FetchRun; reels: Reel[]; stats: CompetitorStats[] } | null>({
    queryKey: ["/api/fetch/latest"],
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.fetchRun && ["queued", "running", "merging", "analyzing"].includes(data.fetchRun.status)) {
        return 3000;
      }
      return false;
    },
  });

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/fetch", { timeRangeDays: timeRange });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fetch/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Fetch started",
        description: "Your data is being processed. This may take a few minutes.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to start fetch",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const cancelFetchMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/fetch/${id}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fetch/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Fetch cancelled",
        description: "You can start a new fetch at any time.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to cancel fetch",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const addCompetitorsMutation = useMutation({
    mutationFn: async (usernames: string[]) => {
      if (usernames.length === 1) {
        await apiRequest("POST", "/api/competitors", { username: usernames[0] });
      } else {
        await apiRequest("POST", "/api/competitors/bulk", { usernames });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/competitors/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
    },
  });

  const reels = latestFetch?.reels || [];
  const stats = latestFetch?.stats || [];
  const fetchRun = latestFetch?.fetchRun;
  const isProcessing = fetchRun && ["queued", "running", "merging", "analyzing"].includes(fetchRun.status);

  const totalViews = reels.reduce((sum, r) => sum + r.views, 0);
  const avgViews = reels.length > 0 ? totalViews / reels.length : 0;
  const avgEngagement = reels.length > 0
    ? reels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / reels.length
    : 0;

  const canFetch = profile && 
    profile.fetchesUsed < profile.monthlyFetchLimit && 
    competitors.length > 0 &&
    !isProcessing;

  return (
    <div className="space-y-6">
      {profile?.plan === "free" && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <span>
            You're on the <strong>Free</strong> plan.{" "}
            Upgrade to unlock 50 competitors and 28-day analytics.
          </span>
          <Link href="/pricing">
            <Button size="sm" variant="outline" className="shrink-0 gap-1">
              <Sparkles className="w-3 h-3" />
              Upgrade
            </Button>
          </Link>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            {profile && <PlanBadge plan={profile.plan} />}
          </div>
          {fetchRun?.completedAt && (
            <p className="text-sm text-muted-foreground">
              Last updated {getTimeAgo(fetchRun.completedAt)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TimeRangeSelector
            value={timeRange}
            onChange={setTimeRange}
            maxDays={profile?.timeRangeMaxDays || 7}
            disabled={isProcessing}
          />
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!canFetch ? 0 : undefined}>
                  <Button
                    onClick={() => fetchMutation.mutate()}
                    disabled={!canFetch || fetchMutation.isPending}
                    data-testid="button-fetch-data"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${fetchMutation.isPending ? "animate-spin" : ""}`} />
                    Fetch Data
                  </Button>
                </span>
              </TooltipTrigger>
              {!canFetch && (
                <TooltipContent>
                  {competitors.length === 0
                    ? "Add at least one competitor first"
                    : isProcessing
                    ? "A fetch is already in progress"
                    : "Monthly fetch limit reached — upgrade your plan"}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {isProcessing && fetchRun && (
        <Card>
          <CardContent className="py-6">
            <FetchStatusStepper status={fetchRun.status} />
            <p className="text-center text-sm text-muted-foreground mt-4">
              Estimated time: 3-5 minutes. Please wait while we fetch your data.
            </p>
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelFetchMutation.mutate(fetchRun.id)}
                disabled={cancelFetchMutation.isPending}
                data-testid="button-stop-fetching"
              >
                {cancelFetchMutation.isPending ? "Stopping..." : "Stop Fetching"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {competitors.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Add Competitors to Get Started"
              description="Add Instagram usernames to track their Reels performance and discover viral content."
              action={{
                label: "Add Your First Competitor",
                onClick: () => document.querySelector<HTMLInputElement>('[data-testid="input-add-competitor"]')?.focus(),
              }}
            />
          ) : reels.length === 0 && !isProcessing ? (
            <EmptyState
              icon={BarChart3}
              title="No Data Yet"
              description="Click 'Fetch Data' to start analyzing your competitors' Reels."
              action={canFetch ? {
                label: "Fetch Data Now",
                onClick: () => fetchMutation.mutate(),
              } : undefined}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Competitors Tracked"
                  value={competitors.length}
                  subtitle={`of ${profile?.maxCompetitors || 5} max`}
                  icon={Users}
                />
                <KPICard
                  title="Reels Analyzed"
                  value={reels.length}
                  icon={Play}
                />
                <KPICard
                  title="Total Views"
                  value={totalViews}
                  icon={Eye}
                />
                <KPICard
                  title="Avg Engagement"
                  value={`${(avgEngagement * 100).toFixed(2)}%`}
                  icon={TrendingUp}
                />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
                  <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="viral" data-testid="tab-viral">Viral Reels</TabsTrigger>
                  <TabsTrigger value="timing" data-testid="tab-timing">Duration & Timing</TabsTrigger>
                  <TabsTrigger value="competitors" data-testid="tab-competitors">Competitors</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-6 mt-6">
                  <div className="grid lg:grid-cols-2 gap-6">
                    <LeaderboardChart stats={stats} />
                    <HeatmapChart reels={reels} />
                  </div>
                  <ViralReelsTable reels={reels.slice(0, 10)} />
                </TabsContent>

                <TabsContent value="viral" className="mt-6">
                  <ViralReelsTable reels={reels} />
                </TabsContent>

                <TabsContent value="timing" className="space-y-6 mt-6">
                  <div className="grid lg:grid-cols-2 gap-6">
                    <DurationChart reels={reels} />
                    <DurationScatterChart reels={reels} />
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary" />
                        Best Posting Windows
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid md:grid-cols-3 gap-4">
                        {["Monday 9:00 AM", "Wednesday 6:00 PM", "Saturday 12:00 PM"].map((time, i) => (
                          <div key={i} className="p-4 rounded-lg bg-muted/50 text-center">
                            <p className="text-2xl font-bold text-primary">#{i + 1}</p>
                            <p className="font-medium mt-1">{time}</p>
                            <p className="text-sm text-muted-foreground">High engagement window</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="competitors" className="mt-6">
                  {stats.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.map((stat) => (
                        <CompetitorCard key={stat.id} stats={stat} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={Users}
                      title="No Competitor Data"
                      description="Fetch data to see detailed competitor analytics."
                    />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        <div className="space-y-6">
          <CompetitorList
            competitors={competitors}
            maxCompetitors={profile?.maxCompetitors || 5}
            onAdd={async (usernames) => {
              await addCompetitorsMutation.mutateAsync(usernames);
            }}
            onRemove={async (id) => {
              await removeCompetitorMutation.mutateAsync(id);
            }}
          />

          {profile && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Plan Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Fetches this month</span>
                  <span className="font-medium">{profile.fetchesUsed}/{profile.monthlyFetchLimit}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Time range</span>
                  <span className="font-medium">{profile.timeRangeMaxDays} days</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">CSV Export</span>
                  <span className="font-medium">{profile.csvExport ? "Enabled" : "Upgrade to Pro"}</span>
                </div>
                {profile.plan !== "pro" && (
                  <Button variant="outline" className="w-full mt-4" data-testid="button-upgrade">
                    Upgrade Plan
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
