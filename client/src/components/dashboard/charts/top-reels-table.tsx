import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface TopReelsTableProps {
  reels: Reel[];
  sortBy: "views" | "engagement";
}

function formatDate(date: string | Date | null): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TopReelsTable({ reels, sortBy }: TopReelsTableProps) {
  const sortedReels = [...reels]
    .sort((a, b) => {
      if (sortBy === "views") {
        return b.views - a.views;
      }
      return parseFloat(String(b.engagementRate)) - parseFloat(String(a.engagementRate));
    })
    .slice(0, 10);

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <h3 className="font-tight font-semibold text-[16px] text-text-primary mb-1">
          Top by {sortBy === "views" ? "Views" : "ER"}
        </h3>
        <p className="font-mono text-[11px] text-text-muted">Top 10 reels sorted by {sortBy === "views" ? "view count" : "engagement rate"}</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border-subtle hover:bg-transparent">
              <TableHead className="w-8 font-mono text-[10px] uppercase tracking-wider text-text-muted">#</TableHead>
              <TableHead className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Username</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-text-muted">Views</TableHead>
              <TableHead className="text-right hidden sm:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Likes</TableHead>
              <TableHead className="text-right hidden sm:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Comments</TableHead>
              <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-text-muted">ER %</TableHead>
              <TableHead className="text-right hidden md:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">VR</TableHead>
              <TableHead className="text-right hidden md:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Duration</TableHead>
              <TableHead className="hidden lg:table-cell font-mono text-[10px] uppercase tracking-wider text-text-muted">Posted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedReels.map((reel, index) => {
              const er = parseFloat(String(reel.engagementRate)) * 100;
              const vr = reel.likes > 0 ? (reel.views / reel.likes).toFixed(1) : "N/A";
              return (
                <TableRow key={reel.id} className="border-border-subtle hover:bg-bg-elevated">
                  <TableCell className="font-mono text-[12px] text-text-muted">{index + 1}</TableCell>
                  <TableCell className="font-mono text-[13px] text-text-primary">@{reel.username}</TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-text-primary">{formatNumber(reel.views)}</TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden sm:table-cell">{formatNumber(reel.likes)}</TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden sm:table-cell">{formatNumber(reel.comments)}</TableCell>
                  <TableCell className={`text-right font-mono text-[13px] ${er >= 3 ? "text-mint" : "text-text-primary"}`}>
                    {er.toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden md:table-cell">{vr}</TableCell>
                  <TableCell className="text-right font-mono text-[13px] text-text-secondary hidden md:table-cell">{reel.durationSeconds}s</TableCell>
                  <TableCell className="font-mono text-[11px] text-text-muted hidden lg:table-cell">
                    {formatDate(reel.postedAt)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
