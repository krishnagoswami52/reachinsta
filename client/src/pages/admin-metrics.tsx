import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  DollarSign,
  Eye,
  Rocket,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Profile } from "@shared/schema";

/**
 * Admin analytics dashboard — READ-ONLY business metrics.
 *
 * Lives at /admin/metrics. The pre-existing /admin page (user management) is
 * untouched. Every number here comes from GET /api/admin/* ; this page never
 * writes anything and never touches pricing, plans or subscriptions.
 */

// ─── types ──────────────────────────────────────────────────────────────────

interface AdminStats {
  users: {
    total: number;
    signups_today: number;
    signups_week: number;
    signups_month: number;
    active_today: number;
    active_week: number;
    free_users: number;
  };
  plans: {
    free: number;
    plus: number;
    pro: number;
    paying_by_plan: Record<string, number>;
  };
  fetches: { today: number; week: number; month: number };
  revenue: {
    paying_customers: number;
    mrr: number;
    arr: number;
    churned_this_month: number;
  };
  traffic: {
    visitors_today: number;
    visitors_week: number;
    unique_visitors_today: number;
    unique_visitors_week: number;
  };
  timestamp: string;
}

interface TrafficRow {
  source?: string;
  path?: string;
  country?: string;
  visits?: string | number;
  views?: string | number;
  unique_visitors?: string | number;
}

interface TrafficStats {
  days: number;
  daily_visitors: { date: string; total_views: string; unique_visitors: string }[];
  top_pages: TrafficRow[];
  traffic_sources: TrafficRow[];
  utm_sources: TrafficRow[];
  top_countries: TrafficRow[];
  peak_hours: { hour: number; visits: string }[];
}

interface ProductHuntStats {
  total_visits: number;
  unique_visitors: number;
  signups: number;
  conversion_rate: string;
  plans: { plan: string; count: number; revenue: number }[];
  total_revenue: number;
  daily: { date: string; visits: string; unique_visitors: string }[];
}

interface ActivityFeedData {
  signups: { id: string; email: string; plan: string; created_at: string }[];
  fetches: {
    id: string;
    email: string | null;
    competitors_count: number;
    time_range_days: number;
    status: string;
    /** Developer-facing failure classification. Admin-only by construction. */
    internal_error_code: string | null;
    created_at: string;
  }[];
  upgrades: {
    id: string;
    email: string | null;
    plan: string;
    subscription_status: string;
    updated_at: string;
  }[];
}

// ─── helpers ────────────────────────────────────────────────────────────────

const n = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: unknown): string => n(value).toLocaleString("en-US");

const time = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—";

const dayMonth = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : "—";

async function fetchAdmin<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── shared chrome ──────────────────────────────────────────────────────────

function Panel({
  title,
  icon: Icon,
  children,
  className = "",
  testId,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={`bg-bg-surface border border-border-subtle rounded-lg p-5 ${className}`}
      data-testid={testId}
    >
      <div className="flex items-center gap-1.5 mb-4">
        {Icon && <Icon className="w-3.5 h-3.5 text-mint" strokeWidth={1.5} />}
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  accent = false,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  testId: string;
}) {
  return (
    <div
      className="bg-bg-surface border border-border-subtle rounded-lg p-5 hover:border-border-soft transition-colors"
      data-testid={testId}
    >
      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </span>
      <div
        className={`font-mono text-[26px] font-medium tracking-tight mt-2 ${
          accent ? "text-mint" : "text-text-primary"
        }`}
      >
        {value}
      </div>
      {sub && <p className="font-mono text-[11px] text-text-muted mt-1">{sub}</p>}
    </div>
  );
}

function StatBlock({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "mint" | "danger" }) {
  const toneClass =
    tone === "mint" ? "text-mint" : tone === "danger" ? "text-danger" : "text-text-primary";
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`font-mono text-[22px] font-medium tracking-tight mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <p className="font-mono text-[11px] text-text-muted">{label}</p>;
}

// ─── sections ───────────────────────────────────────────────────────────────

function AdminHeader({ stats }: { stats?: AdminStats }) {
  return (
    <div className="flex flex-wrap justify-between items-end gap-3" data-testid="admin-metrics-header">
      <div>
        <h1 className="text-2xl font-medium tracking-tighter-2 text-text-primary">
          ReachInsta Admin
        </h1>
        <p className="font-mono text-[11px] text-text-muted mt-1">
          Read-only business metrics · updated{" "}
          {stats ? time(stats.timestamp) : "—"}
        </p>
      </div>
      <div className="text-right">
        <p className="font-mono text-[11px] text-mint">● Live</p>
        <p className="font-mono text-[10px] text-text-muted">stats 30s · activity 15s</p>
      </div>
    </div>
  );
}

function KeyMetricsRow({ stats }: { stats: AdminStats }) {
  const activePct =
    stats.users.total > 0 ? ((stats.users.active_today / stats.users.total) * 100).toFixed(1) : "0.0";

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4" data-testid="admin-kpi-row">
      <MetricCard
        testId="kpi-total-users"
        label="total users"
        value={fmt(stats.users.total)}
        sub={`+${fmt(stats.users.signups_today)} today · +${fmt(stats.users.signups_week)} this week`}
      />
      <MetricCard
        testId="kpi-active-today"
        label="active today"
        value={fmt(stats.users.active_today)}
        sub={`${activePct}% of all users`}
      />
      <MetricCard
        testId="kpi-visitors-today"
        label="visitors today"
        value={fmt(stats.traffic.unique_visitors_today)}
        sub={`${fmt(stats.traffic.visitors_today)} page views`}
      />
      <MetricCard
        testId="kpi-fetches-today"
        label="fetches today"
        value={fmt(stats.fetches.today)}
        sub={`${fmt(stats.fetches.week)} this week`}
      />
      <MetricCard
        testId="kpi-mrr"
        label="mrr"
        value={`$${fmt(stats.revenue.mrr)}`}
        sub={`${fmt(stats.revenue.paying_customers)} paying customers`}
        accent
      />
    </div>
  );
}

function PlanDistribution({ stats }: { stats: AdminStats }) {
  const total = stats.plans.free + stats.plans.plus + stats.plans.pro;
  const rows = [
    { plan: "free", count: stats.plans.free },
    { plan: "plus", count: stats.plans.plus },
    { plan: "pro", count: stats.plans.pro },
  ];

  return (
    <Panel title="plan distribution" icon={Users} testId="admin-plan-distribution">
      <div className="space-y-3">
        {rows.map((row) => {
          const pct = total > 0 ? (row.count / total) * 100 : 0;
          return (
            <div key={row.plan} data-testid={`plan-row-${row.plan}`}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">
                  {row.plan}
                </span>
                <span className="font-mono text-[11px] text-text-primary">
                  {fmt(row.count)}
                  <span className="text-text-muted ml-2">{pct.toFixed(1)}%</span>
                </span>
              </div>
              <div className="h-1 rounded-full bg-bg-elevated overflow-hidden">
                <div
                  className={`h-full rounded-full ${row.plan === "free" ? "bg-border-soft" : "bg-mint"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function RevenueSection({ stats }: { stats: AdminStats }) {
  return (
    <Panel title="revenue" icon={DollarSign} testId="admin-revenue">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBlock label="mrr" value={`$${fmt(stats.revenue.mrr)}`} tone="mint" />
        <StatBlock label="arr" value={`$${fmt(stats.revenue.arr)}`} />
        <StatBlock label="paying customers" value={fmt(stats.revenue.paying_customers)} />
        <StatBlock
          label="churned (30d)"
          value={fmt(stats.revenue.churned_this_month)}
          tone={stats.revenue.churned_this_month > 0 ? "danger" : "default"}
        />
      </div>
      <p className="font-mono text-[10px] text-text-muted mt-4">
        MRR uses the live plan prices (Plus $49/mo, Pro $99/mo). Read-only — this
        page never changes pricing.
      </p>
    </Panel>
  );
}

function GrowthSection({ stats }: { stats: AdminStats }) {
  return (
    <Panel title="growth & usage" icon={TrendingUp} testId="admin-growth">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatBlock label="signups 7d" value={fmt(stats.users.signups_week)} />
        <StatBlock label="signups 30d" value={fmt(stats.users.signups_month)} />
        <StatBlock label="active 7d" value={fmt(stats.users.active_week)} />
        <StatBlock label="fetches 30d" value={fmt(stats.fetches.month)} />
      </div>
    </Panel>
  );
}

function DailyVisitorsChart({ data }: { data: TrafficStats["daily_visitors"] }) {
  if (!data.length) return <EmptyRow label="No page views recorded yet." />;

  const chartData = data.map((row) => ({
    date: dayMonth(row.date),
    visitors: n(row.unique_visitors),
    views: n(row.total_views),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#5A6069" }}
          axisLine={{ stroke: "#1F2227" }}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#5A6069" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "#16191D",
            border: "1px solid #2A2D32",
            borderRadius: 8,
            fontSize: 11,
          }}
          labelStyle={{ color: "#8B9199" }}
        />
        <Line type="monotone" dataKey="visitors" stroke="#7CFFB2" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="views" stroke="#5A6069" strokeWidth={1} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrafficSection({ traffic }: { traffic?: TrafficStats }) {
  if (!traffic) {
    return (
      <Panel title="traffic" icon={Eye} testId="admin-traffic-loading">
        <EmptyRow label="Loading traffic…" />
      </Panel>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-traffic">
      <Panel title={`daily visitors · last ${traffic.days} days`} icon={Eye}>
        <DailyVisitorsChart data={traffic.daily_visitors} />
      </Panel>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel title="traffic sources" testId="admin-traffic-sources">
          <div className="space-y-2">
            {traffic.traffic_sources.length === 0 && <EmptyRow label="No traffic yet." />}
            {traffic.traffic_sources.map((source) => (
              <div key={source.source} className="flex justify-between items-baseline">
                <span className="font-mono text-[11px] text-text-secondary">{source.source}</span>
                <span className="font-mono text-[11px] text-text-primary">
                  {fmt(source.unique_visitors)}
                  <span className="text-text-muted ml-2">{fmt(source.visits)} views</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="top pages" testId="admin-top-pages">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {traffic.top_pages.length === 0 && <EmptyRow label="No page views yet." />}
            {traffic.top_pages.map((page) => (
              <div key={page.path} className="flex justify-between items-baseline gap-3">
                <span className="font-mono text-[11px] text-text-secondary truncate">{page.path}</span>
                <span className="font-mono text-[11px] text-text-primary shrink-0">
                  {fmt(page.unique_visitors)}
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="utm campaigns / countries" testId="admin-utm">
          <div className="space-y-2">
            {traffic.utm_sources.length === 0 && <EmptyRow label="No UTM-tagged traffic yet." />}
            {traffic.utm_sources.map((source) => (
              <div key={`utm-${source.source}`} className="flex justify-between items-baseline">
                <span className="font-mono text-[11px] text-mint">?utm_source={source.source}</span>
                <span className="font-mono text-[11px] text-text-primary">
                  {fmt(source.unique_visitors)}
                </span>
              </div>
            ))}
            {traffic.top_countries.length > 0 && (
              <div className="pt-3 mt-3 border-t border-border-subtle space-y-2">
                {traffic.top_countries.map((country) => (
                  <div key={`c-${country.country}`} className="flex justify-between items-baseline">
                    <span className="font-mono text-[11px] text-text-secondary">{country.country}</span>
                    <span className="font-mono text-[11px] text-text-primary">
                      {fmt(country.unique_visitors)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const PH_LAUNCH_URL =
  "https://reachinsta.com/?utm_source=producthunt&utm_medium=launch&utm_campaign=launch_day";

function ProductHuntSection({ phStats }: { phStats?: ProductHuntStats }) {
  const isLive = !!phStats && phStats.total_visits > 0;

  return (
    <div
      className={`rounded-lg p-5 border ${
        isLive ? "border-mint bg-mint-dim" : "border-border-subtle bg-bg-surface"
      }`}
      data-testid="admin-producthunt"
    >
      <div className="flex items-center gap-1.5 mb-4">
        <Rocket className="w-3.5 h-3.5 text-mint" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
          product hunt launch
        </span>
        {isLive && (
          <span className="font-mono text-[9px] uppercase tracking-wider bg-mint text-bg-base px-1.5 py-0.5 rounded">
            live
          </span>
        )}
      </div>

      {!phStats ? (
        <EmptyRow label="Loading…" />
      ) : !isLive ? (
        <div>
          <p className="font-mono text-[11px] text-text-muted">
            No Product Hunt traffic yet. Launch with this URL and it fills in automatically:
          </p>
          <code className="block font-mono text-[11px] text-mint mt-2 break-all">
            {PH_LAUNCH_URL}
          </code>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBlock label="total visits" value={fmt(phStats.total_visits)} />
          <StatBlock label="unique visitors" value={fmt(phStats.unique_visitors)} />
          <StatBlock label="signups" value={fmt(phStats.signups)} tone="mint" />
          <StatBlock label="conversion" value={`${phStats.conversion_rate}%`} />
          <StatBlock label="revenue" value={`$${fmt(phStats.total_revenue)}`} tone="mint" />
        </div>
      )}
    </div>
  );
}

function ActivityFeed({ activity }: { activity?: ActivityFeedData }) {
  if (!activity) {
    return (
      <Panel title="activity" icon={Activity} testId="admin-activity-loading">
        <EmptyRow label="Loading activity…" />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="admin-activity">
      <Panel title="recent signups" icon={Users} testId="admin-activity-signups">
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {activity.signups.length === 0 && <EmptyRow label="No signups yet." />}
          {activity.signups.map((row) => (
            <div key={row.id}>
              <p className="font-mono text-[11px] text-text-primary truncate">{row.email}</p>
              <p className="font-mono text-[10px] text-text-muted">
                {row.plan} · {dayMonth(row.created_at)} {time(row.created_at)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="recent fetches" icon={Zap} testId="admin-activity-fetches">
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {activity.fetches.length === 0 && <EmptyRow label="No fetches yet." />}
          {activity.fetches.map((row) => (
            <div key={row.id}>
              <p className="font-mono text-[11px] text-text-primary truncate">{row.email ?? "—"}</p>
              <p className="font-mono text-[10px] text-text-muted">
                {fmt(row.competitors_count)} competitors · {row.status} · {time(row.created_at)}
              </p>
              {row.internal_error_code && (
                <p className="font-mono text-[10px] text-danger/70">
                  {row.internal_error_code}
                </p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="paid plans" icon={DollarSign} testId="admin-activity-upgrades">
        <div className="space-y-3 max-h-72 overflow-y-auto">
          {activity.upgrades.length === 0 && <EmptyRow label="No paid plans yet." />}
          {activity.upgrades.map((row) => (
            <div key={row.id}>
              <p className="font-mono text-[11px] text-text-primary truncate">{row.email ?? "—"}</p>
              <p className="font-mono text-[10px] text-mint">
                {row.plan.toUpperCase()} · {row.subscription_status} · {dayMonth(row.updated_at)}
              </p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

export default function AdminMetricsPage() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Same source of authority as the /admin page and the sidebar: profiles.role.
  const { data: profile, isLoading: isProfileLoading } = useQuery<Profile>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated,
  });

  const allowed = profile?.role === "admin";
  const isCheckingAccess = authLoading || (isAuthenticated && isProfileLoading);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setLocation("/login", { replace: true });
      return;
    }
    if (!isProfileLoading && profile && !allowed) {
      setLocation("/dashboard", { replace: true });
    }
  }, [authLoading, isAuthenticated, isProfileLoading, profile, allowed, setLocation]);

  const { data: stats, error: statsError } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: () => fetchAdmin<AdminStats>("/api/admin/stats"),
    refetchInterval: 30_000,
    enabled: allowed,
  });

  const { data: activity } = useQuery<ActivityFeedData>({
    queryKey: ["/api/admin/activity"],
    queryFn: () => fetchAdmin<ActivityFeedData>("/api/admin/activity"),
    refetchInterval: 15_000,
    enabled: allowed,
  });

  const { data: traffic } = useQuery<TrafficStats>({
    queryKey: ["/api/admin/traffic"],
    queryFn: () => fetchAdmin<TrafficStats>("/api/admin/traffic?days=7"),
    refetchInterval: 60_000,
    enabled: allowed,
  });

  const { data: phStats } = useQuery<ProductHuntStats>({
    queryKey: ["/api/admin/producthunt"],
    queryFn: () => fetchAdmin<ProductHuntStats>("/api/admin/producthunt"),
    refetchInterval: 30_000,
    enabled: allowed,
  });

  if (isCheckingAccess || !allowed) {
    return (
      <div className="p-8 font-mono text-[11px] text-text-muted" data-testid="admin-metrics-gate">
        Checking admin access…
      </div>
    );
  }

  if (statsError) {
    return (
      <div className="p-8 font-mono text-[11px] text-danger" data-testid="admin-metrics-error">
        Failed to load admin stats: {(statsError as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1" data-testid="admin-metrics-page">
      <AdminHeader stats={stats} />

      {!stats ? (
        <p className="font-mono text-[11px] text-text-muted">Loading admin dashboard…</p>
      ) : (
        <>
          <KeyMetricsRow stats={stats} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PlanDistribution stats={stats} />
            <GrowthSection stats={stats} />
          </div>
          <RevenueSection stats={stats} />
        </>
      )}

      <ProductHuntSection phStats={phStats} />
      <TrafficSection traffic={traffic} />
      <ActivityFeed activity={activity} />
    </div>
  );
}
