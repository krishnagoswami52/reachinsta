import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatNumber, formatPercentage, getDurationBucket } from "@/lib/utils";
import { ExternalLink, TrendingUp, ArrowUpDown, Search, Filter } from "lucide-react";
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
    <Button
      variant="ghost"
      size="sm"
      className="h-8 -ml-3 font-medium"
      onClick={() => toggleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-1 h-3 w-3" />
    </Button>
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Top 25 Viral Reels
          </CardTitle>
          
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[150px]"
                data-testid="input-search-reels"
              />
            </div>
            
            <Select value={filterCompetitor} onValueChange={setFilterCompetitor}>
              <SelectTrigger className="w-[150px]" data-testid="select-filter-competitor">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All competitors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All competitors</SelectItem>
                {uniqueCompetitors.map((username) => (
                  <SelectItem key={username} value={username}>
                    @{username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Input
              type="number"
              placeholder="Min views"
              value={minViews}
              onChange={(e) => setMinViews(e.target.value)}
              className="w-[120px]"
              data-testid="input-min-views"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Competitor</TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="views">Views</SortableHeader>
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell">Likes</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Comments</TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="engagementRate">ER</SortableHeader>
                </TableHead>
                <TableHead className="text-center hidden md:table-cell">Duration</TableHead>
                <TableHead className="text-right">
                  <SortableHeader field="viralScore">Score</SortableHeader>
                </TableHead>
                <TableHead className="text-right hidden sm:table-cell">
                  <SortableHeader field="postedAt">Posted</SortableHeader>
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {isLoading ? "Loading reels..." : "No reels found"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredReels.map((reel, index) => (
                  <TableRow
                    key={reel.id}
                    className="hover-elevate"
                    data-testid={`reel-row-${index}`}
                  >
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">@{reel.username}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatNumber(reel.views)}
                    </TableCell>
                    <TableCell className="text-right font-mono hidden sm:table-cell">
                      {formatNumber(reel.likes)}
                    </TableCell>
                    <TableCell className="text-right font-mono hidden sm:table-cell">
                      {formatNumber(reel.comments)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="font-mono text-xs">
                        {formatPercentage(parseFloat(String(reel.engagementRate)))}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {getDurationBucket(reel.durationSeconds)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className="font-mono text-xs bg-primary/10 text-primary hover:bg-primary/20">
                        {parseFloat(String(reel.viralScore)).toFixed(2)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground hidden sm:table-cell">
                      {reel.postedAt ? new Date(reel.postedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        asChild
                      >
                        <a
                          href={reel.reelUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`link-reel-${index}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
