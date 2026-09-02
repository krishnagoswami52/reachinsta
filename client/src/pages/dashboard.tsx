import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

import { KPICard } from "@/components/dashboard/kpi-card";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { FetchStatusStepper } from "@/components/dashboard/fetch-status-stepper";
import { QueuePositionCard } from "@/components/dashboard/queue-position-card";
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
import { RefreshCw, TrendingUp, Eye, Users, BarChart3, Play, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { formatNumber, getTimeAgo } from "@/lib/utils";
import type { Profile, Competitor, FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function DashboardPage() {
  useEffect(() => { document.title = "Dashboard - ReachInsta"; }, []);
  const { toast } = useToast();
  const [timeRange, setTimeRange] = useState(7);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: profile } = useQuery<Profile>({ queryKey: ["/api/profile"] });
  const { data: competitors = [] } = useQuery<Competitor[]>({ queryKey: ["/api/competitors"] });

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
      toast({ title: "Fetch started", description: "Your data is being processed. This may take a few minutes." });
    },
    onError: (error) => {
      toast({ title: "Failed to start fetch", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    },
  });

  const cancelFetchMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/fetch/${id}/cancel`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fetch/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({ title: "Fetch cancelled", description: "You can start a new fetch at any time." });
    },
    onError: (error) => {
      toast({ title: "Failed to cancel fetch", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/competitors"] }); },
  });

  const removeCompetitorMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/competitors/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/competitors"] }); },
  });

  const reels   = latestFetch?.reels  || [];
  const stats   = latestFetch?.stats  || [];
  const fetchRun = latestFetch?.fetchRun;
  const isProcessing = fetchRun && ["queued", "running", "merging", "analyzing"].includes(fetchRun.status);

  const totalViews    = reels.reduce((sum, r) => sum + r.views, 0);
  const avgViews      = reels.length > 0 ? totalViews / reels.length : 0;
  const avgEngagement = reels.length > 0
    ? reels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / reels.length
    : 0;
  const topViews = reels.length > 0 ? Math.max(...reels.map(r => r.views)) : 0;

  const canFetch = profile &&
    profile.fetchesUsed < profile.monthlyFetchLimit &&
    competitors.length > 0 &&
    !isProcessing;

  // One-shot attention pulse on the "View Full Analytics" CTA. It fires the
  // first time a completed run is rendered and is remembered per run id, so a
  // fresh fetch earns a new pulse but re-visiting the dashboard does not.
  const completedRunId = fetchRun?.status === "completed" ? fetchRun.id : undefined;
  const [pulseRunId, setPulseRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!completedRunId) return;
    const key = `analytics-cta-pulsed:${completedRunId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Private mode / storage disabled — pulse once and move on.
    }
    setPulseRunId(completedRunId);
  }, [completedRunId]);

  // /api/fetch/history is what the Analytics page reads to pick which run to
  // show, and the query client runs with staleTime: Infinity — so once that
  // list is cached it never notices a newer run and Analytics keeps rendering
  // the previous fetch. Nothing else invalidates it, so do it here the moment
  // a run reports completed. Covers the sidebar route too, not just the CTA.
  useEffect(() => {
    if (!completedRunId) return;
    queryClient.invalidateQueries({ queryKey: ["/api/fetch/history"] });
  }, [completedRunId]);

  const stopPulse = () => setPulseRunId(null);
  const isPulsing = pulseRunId !== null && pulseRunId === completedRunId;

  // Retire the pulse once the three cycles finish, or the moment the user
  // interacts anywhere on the page. Unmounting covers navigating away.
  useEffect(() => {
    if (!isPulsing) return;
    const done = () => setPulseRunId(null);
    const timer = window.setTimeout(done, 3 * 1600);
    document.addEventListener("pointerdown", done, { once: true });
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", done);
    };
  }, [isPulsing]);

  return (
    <div className="space-y-6">
      {/* Free-plan upgrade nudge */}
      {profile?.plan === "free" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border border-border-subtle bg-bg-elevated px-4 py-3 text-sm">
          <span className="text-text-secondary">
            You're on the <span className="text-text-primary font-medium">Free</span> plan.{" "}
            Upgrade to unlock 50 competitors and 28-day analytics.
          </span>
          <Link href="/pricing">
            <button className="shrink-0 w-full sm:w-auto inline-flex items-center gap-1.5 border border-border-subtle hover:border-mint text-text-secondary hover:text-mint text-[13px] px-3 py-1.5 rounded-md transition-colors">
              <Sparkles className="w-3 h-3" strokeWidth={1.5} />
              Upgrade
            </button>
          </Link>
        </div>
      )}

      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary">
              Dashboard
            </h1>
            {profile && <PlanBadge plan={profile.plan} />}
          </div>
          <p className="font-mono text-[12px] text-text-muted">
            {fetchRun?.completedAt
              ? `Last updated ${getTimeAgo(fetchRun.completedAt)}`
              : "No data fetched yet"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <TimeRangeSelector
            value={timeRange}
            onChange={setTimeRange}
            maxDays={profile?.timeRangeMaxDays || 7}
            disabled={!!isProcessing}
          />

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!canFetch ? 0 : undefined}>
                  <button
                    onClick={() => fetchMutation.mutate()}
                    disabled={!canFetch || fetchMutation.isPending}
                    className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-2.5 rounded-md inline-flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="button-fetch-data"
                  >
                    <RefreshCw className={`w-4 h-4 ${fetchMutation.isPending ? "animate-spin" : ""}`} strokeWidth={1.5} />
                    Fetch Data
                  </button>
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

      {/* Fetch in progress */}
      {isProcessing && fetchRun && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
          <FetchStatusStepper status={fetchRun.status} errorMessage={fetchRun.errorMessage} />
          <div className="mt-5">
            <QueuePositionCard runId={fetchRun.id} isActive={!!isProcessing} />
          </div>
          <p className="text-center text-[13px] text-text-muted mt-4">
            Estimated time: 3–5 minutes. Please wait while we fetch your data.
          </p>
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => cancelFetchMutation.mutate(fetchRun.id)}
              disabled={cancelFetchMutation.isPending}
              className="border border-border-subtle hover:border-danger text-text-secondary hover:text-danger text-[13px] px-4 py-2 rounded-md transition-colors disabled:opacity-50"
              data-testid="button-stop-fetching"
            >
              {cancelFetchMutation.isPending ? "Stopping..." : "Stop Fetching"}
            </button>
          </div>
        </div>
      )}

      {/* Last fetch failed. The copy comes from the server already translated
          (server/utils/errorMessages.ts) — a run recovered by the stuck-job
          sweep carries no message at all and never reaches this branch. */}
      {!isProcessing && fetchRun?.status === "failed" && (
        <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
          <FetchStatusStepper status="failed" errorMessage={fetchRun.errorMessage} />
        </div>
      )}

      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 min-w-0 space-y-6">
          {competitors.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No competitors tracked yet."
              description="Drop an Instagram handle on the right and we'll start pulling their Reels. Up to 100 competitors, refreshed when you say so."
              action={{
                label: "Add your first competitor",
                onClick: () => document.querySelector<HTMLInputElement>('[data-testid="input-add-competitor"]')?.focus(),
              }}
              footnote="PS: Your competitors won't be notified. Pinky promise."
            />
          ) : reels.length === 0 && !isProcessing ? (
            <EmptyState
              icon={BarChart3}
              title="No data yet."
              description='Run your first fetch to see the magic.'
              action={canFetch ? {
                label: "Fetch Data Now",
                onClick: () => fetchMutation.mutate(),
              } : undefined}
            />
          ) : (
            <>
              {/* KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                <KPICard title="competitors tracked" value={competitors.length} subtitle={`of ${profile?.maxCompetitors || 5} max`} icon={Users} />
                <KPICard title="reels analyzed" value={reels.length} icon={Play} />
                <KPICard title="total views" value={totalViews} icon={Eye} />
                <KPICard title="avg engagement" value={`${(avgEngagement * 100).toFixed(2)}%`} icon={TrendingUp} highlight />
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* The underline now lives on this row rather than on TabsList so it
                    runs the full width, past the CTA. TabsList keeps its own
                    horizontal scroll; the CTA sits outside it and stays put. */}
                <div className="flex items-center gap-2 border-b border-border -mx-4 px-4 lg:mx-0 lg:px-0">
                  <TabsList className="border-b-0 mx-0 px-0 min-w-0">
                    <TabsTrigger value="overview"     data-testid="tab-overview">Overview</TabsTrigger>
                    <TabsTrigger value="viral"        data-testid="tab-viral">Viral Reels</TabsTrigger>
                    <TabsTrigger value="timing"       data-testid="tab-timing">Timing</TabsTrigger>
                    <TabsTrigger value="competitors"  data-testid="tab-competitors">Competitors</TabsTrigger>
                  </TabsList>

                  {/* Only once there is something to look at: hidden while a run
                      is queued/running/merging/analyzing, on failure, and for
                      users who have never fetched. */}
                  {completedRunId && (
                    // The fade-in lives on the wrapper because .pulse-attention
                    // and .animate-fade-up both set `animation` and would cancel
                    // each other out on a single element.
                    <span className="shrink-0 animate-fade-up">
                      <Link
                        href="/analytics"
                        onMouseEnter={stopPulse}
                        onClick={stopPulse}
                        className={`bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[13px] sm:text-[14px] px-3 sm:px-4 py-2 rounded-md inline-flex items-center gap-1.5 transition-all hover:-translate-y-px ${isPulsing ? "pulse-attention" : ""}`}
                        data-testid="link-full-analytics"
                      >
                        <span className="hidden sm:inline">View Full Analytics</span>
                        <span className="sm:hidden">Analytics</span>
                        <ArrowRight className="w-4 h-4" strokeWidth={2} />
                      </Link>
                    </span>
                  )}
                </div>

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
                </TabsContent>

                <TabsContent value="competitors" className="mt-6">
                  {stats.length > 0 ? (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stats.map((stat) => (
                        <CompetitorCard key={stat.id} stats={stat} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon={Users} title="No competitor data" description="Fetch data to see detailed competitor analytics." />
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        {/* Right sidebar. space-y-6 matches both the main column's stack and the
            grid's own gap-6, so the two columns keep the same vertical rhythm. */}
        <div className="space-y-6">
          <CompetitorList
            competitors={competitors}
            maxCompetitors={profile?.maxCompetitors || 5}
            onAdd={async (usernames) => { await addCompetitorsMutation.mutateAsync(usernames); }}
            onRemove={async (id) => { await removeCompetitorMutation.mutateAsync(id); }}
          />

          {profile && (
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-tight font-semibold text-[16px] text-text-primary">Plan Usage</h3>
                <PlanBadge plan={profile.plan} />
              </div>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-text-secondary">Fetches used</span>
                    <span className="font-mono text-[12px] text-text-primary">
                      {profile.fetchesUsed}/{profile.monthlyFetchLimit}
                    </span>
                  </div>
                  <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                    <div
                      className="h-full bg-mint transition-all"
                      style={{ width: `${Math.min((profile.fetchesUsed / profile.monthlyFetchLimit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-text-secondary">Competitors</span>
                    <span className="font-mono text-[12px] text-text-primary">
                      {competitors.length}/{profile.maxCompetitors}
                    </span>
                  </div>
                  <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                    <div
                      className="h-full bg-mint transition-all"
                      style={{ width: `${Math.min((competitors.length / profile.maxCompetitors) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-text-secondary">CSV Export</span>
                    <span className="font-mono text-[12px] text-text-primary">
                      {profile.csvExport ? "Enabled" : "Pro only"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-5 pt-4 border-t border-border-subtle">
                <p className="font-mono text-[10px] text-text-muted">Resets on the 1st of each month.</p>
              </div>
              {profile.plan !== "pro" && (
                <Link href="/pricing">
                  <button className="w-full mt-3 border border-border-subtle hover:border-mint text-text-secondary hover:text-mint text-[13px] py-2 rounded-md transition-colors" data-testid="button-upgrade">
                    Upgrade Plan
                  </button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
