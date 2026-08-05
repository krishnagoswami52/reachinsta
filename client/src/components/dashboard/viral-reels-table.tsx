import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber, formatPercentage, getDurationBucket } from "@/lib/utils";
import { ExternalLink, TrendingUp, ArrowUpDown, Search, Filter } from "lucide-react";
import { HelpText } from "@/components/analytics/HelpText";
import { METRIC_HELP } from "@/lib/metric-help";
import type { Reel } from "@shared/schema";

interface ViralReelsTableProps {
  reels: Reel[];
  competitors?: string[];
  isLoading?: boolean;
}

type SortField = "viralScore" | "views" | "engagementRate" | "postedAt";

export function ViralReelsTable({ reels, competitors = [], isLoading }: ViralReelsTableProps) {
  const [sortBy, setSortBy] = useState<SortField>("viralScore");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filterCompetitor, setFilterCompetitor] = useState<string>("all");
  const [minViews, setMinViews] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");

  const uniqueCompetitors = (() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const reel of reels) {
      if (!seen.has(reel.username)) {
        seen.add(reel.username);
        list.push(reel.username);
      }
    }
    return list;
  })();

  const filteredReels = reels
    .filter((reel) => {
      if (filterCompetitor !== "all" && reel.username !== filterCompetitor) return false;
      if (minViews && reel.views < parseInt(minViews)) return false;
      if (searchQuery && !reel.username.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortBy) {
        case "viralScore":
          aVal = parseFloat(String(a.viralScore));
          bVal = parseFloat(String(b.viralScore));
          break;
        case "views":
          aVal = a.views;
          bVal = b.views;
          break;
        case "engagementRate":
          aVal = parseFloat(String(a.engagementRate));
          bVal = parseFloat(String(b.engagementRate));
          break;
        case "postedAt":
          aVal = a.postedAt ? new Date(a.postedAt).getTime() : 0;
          bVal = b.postedAt ? new Date(b.postedAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      return sortOrder === "desc" ? bVal - aVal : aVal - bVal;
    })
    .slice(0, 25);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortableHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-mint" strokeWidth={1.5} />
            <h3 className="font-tight font-semibold text-[16px] text-text-primary">Top 25 Viral Reels</h3>
          </div>
          <p className="font-mono text-[11px] text-text-muted">Ranked by viral score — views, engagement, and recency</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[150px] h-8 bg-bg-base border border-border-subtle rounded-md font-mono text-[12px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-mint focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
              data-testid="input-search-reels"
            />
          </div>

          <Select value={filterCompetitor} onValueChange={setFilterCompetitor}>
            <SelectTrigger className="w-[150px] h-8 bg-bg-base border-border-subtle font-mono text-[12px] text-text-primary" data-testid="select-filter-competitor">
              <Filter className="w-3.5 h-3.5 mr-2 text-text-muted" />
              <SelectValue placeholder="All competitors" />
            </SelectTrigger>
            <SelectContent className="bg-bg-elevated border-border-subtle">
              <SelectItem value="all" className="font-mono text-[12px]">All competitors</SelectItem>
              {uniqueCompetitors.map((username) => (
                <SelectItem key={username} value={username} className="font-mono text-[12px]">
                  @{username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <input
            type="number"
            placeholder="Min views"
            value={minViews}
            onChange={(e) => setMinViews(e.target.value)}
            className="w-[120px] h-8 bg-bg-base border border-border-subtle rounded-md font-mono text-[12px] text-text-primary placeholder:text-text-muted px-3 focus:outline-none focus:border-mint focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
            data-testid="input-min-views"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-bg-elevated border-border-subtle hover:bg-bg-elevated">
                <TableHead className="w-10 font-mono text-[10px] uppercase tracking-wider text-text-muted">#</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Competitor</TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="views">Views</SortableHeader>
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Likes</TableHead>
                <TableHead className="text-right hidden sm:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Comments</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <SortableHeader field="engagementRate">ER</SortableHeader>
                    <HelpText {...METRIC_HELP.er} />
                  </span>
                </TableHead>
                <TableHead className="text-center hidden md:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Duration</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    <SortableHeader field="viralScore">Score</SortableHeader>
                    <HelpText {...METRIC_HELP.viralScore} />
                  </span>
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  <SortableHeader field="postedAt">Posted</SortableHeader>
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReels.length === 0 ? (
                <TableRow className="border-border-subtle">
                  <TableCell colSpan={10} className="text-center py-8 font-mono text-[12px] text-text-muted">
                    {isLoading ? "Loading reels..." : "No reels found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReels.map((reel, index) => {
                  const er = parseFloat(String(reel.engagementRate)) * 100;
                  return (
                    <TableRow
                      key={reel.id}
                      className="border-border-subtle hover:bg-bg-elevated"
                      data-testid={`reel-row-${index}`}
                    >
                      <TableCell className="font-mono text-[12px] text-text-muted">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-[13px] text-text-primary">@{reel.username}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-primary">
                        {formatNumber(reel.views)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden sm:table-cell">
                        {formatNumber(reel.likes)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden sm:table-cell">
                        {formatNumber(reel.comments)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono text-[13px] ${er >= 3 ? "text-mint" : "text-text-primary"}`}>
                          {formatPercentage(parseFloat(String(reel.engagementRate)))}
                        </span>
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        <span className="font-mono text-[11px] px-2 py-0.5 bg-bg-base border border-border-subtle rounded text-text-muted">
                          {getDurationBucket(reel.durationSeconds)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono text-[13px] text-mint">
                          {parseFloat(String(reel.viralScore)).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-text-muted hidden sm:table-cell">
                        {reel.postedAt ? new Date(reel.postedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <a
                          href={reel.reelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-mint hover:bg-mint-dim transition-colors"
                          data-testid={`link-reel-${index}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
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
        💡 Ranked by weighted viral score (views + engagement, log scale). Copy their structure, hooks, and captions.
      </p>
    </div>
  );
}
