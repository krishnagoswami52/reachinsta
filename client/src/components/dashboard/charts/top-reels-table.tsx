import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Top by {sortBy === "views" ? "Views" : "ER"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Username</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Likes</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Comments</TableHead>
                <TableHead className="text-right">ER %</TableHead>
                <TableHead className="text-right hidden md:table-cell">VR</TableHead>
                <TableHead className="text-right hidden md:table-cell">Duration</TableHead>
                <TableHead className="hidden lg:table-cell">Posted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedReels.map((reel, index) => {
                const er = parseFloat(String(reel.engagementRate)) * 100;
                const vr = reel.likes > 0 ? (reel.views / reel.likes).toFixed(1) : "N/A";
                return (
                  <TableRow key={reel.id}>
                    <TableCell className="font-medium">{index + 1}</TableCell>
                    <TableCell className="font-medium">@{reel.username}</TableCell>
                    <TableCell className="text-right">{formatNumber(reel.views)}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">{formatNumber(reel.likes)}</TableCell>
                    <TableCell className="text-right hidden sm:table-cell">{formatNumber(reel.comments)}</TableCell>
                    <TableCell className="text-right">{er.toFixed(2)}%</TableCell>
                    <TableCell className="text-right hidden md:table-cell">{vr}</TableCell>
                    <TableCell className="text-right hidden md:table-cell">{reel.durationSeconds}s</TableCell>
                    <TableCell className="text-sm text-muted-foreground hidden lg:table-cell">
                      {formatDate(reel.postedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
