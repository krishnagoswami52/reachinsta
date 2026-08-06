import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, Users } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { classifyER } from "@/lib/benchmarks";
import { TierPill } from "@/components/analytics/TierBadge";
import { HelpText } from "@/components/analytics/HelpText";
import { METRIC_HELP } from "@/lib/metric-help";
import type { Reel } from "@shared/schema";

interface AllCompetitorsTableProps {
  reels: Reel[];
}

type SortField = "username" | "reelCount" | "avgViews" | "avgER" | "topViews";
type Trend = "up" | "down" | "flat" | "unknown";

interface CompetitorRow {
  username: string;
  reelCount: number;
  avgViews: number;
  avgER: number;
  topViews: number;
  trend: Trend;
}

/** Reels needed before a newer-vs-older split says anything. */
const MIN_TREND_SAMPLE = 6;
/** ER change beyond this reads as a real move, not noise. */
const TREND_THRESHOLD = 0.1;

/**
 * Engagement direction inside this fetch window: newer half vs older half.
 *
 * Deliberately ER, not views. View counts keep accumulating after posting, so a
 * reel from two days ago always trails one from two weeks ago — a views-based
 * trend would print ↓ for almost every account regardless of performance.
 * ER is a ratio of numbers that grow together, so it stays comparable by age.
 */
function computeTrend(reels: Reel[]): Trend {
  const dated = reels
    .filter(r => r.postedAt !== null)
    .sort((a, b) => new Date(a.postedAt!).getTime() - new Date(b.postedAt!).getTime());

  if (dated.length < MIN_TREND_SAMPLE) return "unknown";

  const split = Math.floor(dated.length / 2);
  const avgER = (list: Reel[]) =>
    list.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / list.length;
  const older = avgER(dated.slice(0, split));
  const newer = avgER(dated.slice(dated.length - split));
  if (older === 0) return "unknown";

  const change = (newer - older) / older;
  if (change > TREND_THRESHOLD) return "up";
  if (change < -TREND_THRESHOLD) return "down";
  return "flat";
}

const TREND_DISPLAY: Record<Trend, { symbol: string; className: string; title: string }> = {
  up: { symbol: "↑", className: "text-mint", title: "Recent reels engaging better than earlier ones" },
  down: { symbol: "↓", className: "text-danger", title: "Recent reels engaging worse than earlier ones" },
  flat: { symbol: "→", className: "text-text-secondary", title: "Engagement roughly flat across the window" },
  unknown: { symbol: "—", className: "text-text-muted", title: "Fewer than 6 dated reels — not enough to compare" },
};

export function AllCompetitorsTable({ reels }: AllCompetitorsTableProps) {
  const [sortBy, setSortBy] = useState<SortField>("avgViews");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Built from the same filtered reels the KPI cards use, so the numbers here
  // match the rest of the page rather than the raw server-side stats rows.
  const rows = useMemo<CompetitorRow[]>(() => {
    const grouped = new Map<string, Reel[]>();
    for (const reel of reels) {
      const list = grouped.get(reel.username);
      if (list) list.push(reel);
      else grouped.set(reel.username, [reel]);
    }

    return Array.from(grouped.entries()).map(([username, list]) => ({
      username,
      reelCount: list.length,
      avgViews: list.reduce((sum, r) => sum + r.views, 0) / list.length,
      avgER:
        (list.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / list.length) * 100,
      topViews: Math.max(...list.map(r => r.views)),
      trend: computeTrend(list),
    }));
  }, [reels]);

  const sortedRows = useMemo(() => {
    const direction = sortOrder === "desc" ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sortBy === "username") return a.username.localeCompare(b.username) * direction;
      return (a[sortBy] - b[sortBy]) * direction;
    });
  }, [rows, sortBy, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder(field === "username" ? "asc" : "desc");
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      type="button"
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
      onClick={() => toggleSort(field)}
      data-testid={`sort-competitors-${field}`}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-mint" strokeWidth={1.5} />
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">All Competitors</h3>
          <HelpText {...METRIC_HELP.allCompetitors} />
        </div>
        <p className="font-mono text-[11px] text-text-muted">
          {rows.length} tracked account{rows.length === 1 ? "" : "s"} — click any header to sort
        </p>
      </div>

      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-bg-elevated border-border-subtle hover:bg-bg-elevated">
                <TableHead>
                  <SortableHeader field="username">Username</SortableHeader>
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="reelCount">Reels</SortableHeader>
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="avgViews">Avg Views</SortableHeader>
                </TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <SortableHeader field="avgER">Avg ER</SortableHeader>
                    <HelpText {...METRIC_HELP.avgER} />
                  </span>
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  <SortableHeader field="topViews">Top Reel</SortableHeader>
                </TableHead>
                <TableHead className="text-center hidden md:table-cell">
                  <span className="inline-flex items-center gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">ER Trend</span>
                    <HelpText {...METRIC_HELP.competitorTrend} />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.length === 0 ? (
                <TableRow className="border-border-subtle">
                  <TableCell colSpan={6} className="text-center py-8 font-mono text-[12px] text-text-muted">
                    No competitor data
                  </TableCell>
                </TableRow>
              ) : (
                sortedRows.map((row, index) => {
                  const trend = TREND_DISPLAY[row.trend];
                  return (
                    <TableRow
                      key={row.username}
                      className="border-border-subtle hover:bg-bg-elevated"
                      data-testid={`competitor-row-${index}`}
                    >
                      <TableCell className="font-mono text-[13px] text-text-primary">@{row.username}</TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-secondary">
                        {row.reelCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-primary">
                        {formatNumber(Math.round(row.avgViews))}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center justify-end gap-2">
                          <span className="font-mono text-[13px] text-mint">{row.avgER.toFixed(2)}%</span>
                          <TierPill tier={classifyER(row.avgER)} />
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden sm:table-cell">
                        {formatNumber(row.topViews)}
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <span className={`font-mono text-[14px] ${trend.className}`} title={trend.title}>
                          {trend.symbol}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="font-mono text-[11px] text-text-muted italic border-t border-border-subtle pt-3 mt-4">
        💡 Averages exclude reels with unreliable data, so they match the KPI cards above. ER Trend compares each
        account's newer reels against its older ones inside this fetch window.
      </p>
    </div>
  );
}
