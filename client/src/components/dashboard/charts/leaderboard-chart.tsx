import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Trophy } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { CompetitorStats } from "@shared/schema";

interface LeaderboardChartProps {
  stats: CompetitorStats[];
}

export function LeaderboardChart({ stats }: LeaderboardChartProps) {
  const data = stats
    .map((s) => ({
      name: `@${s.username}`,
      avgViews: parseFloat(String(s.avgViews)),
      followers: s.followers || 0,
      reelsCount: s.reelsCount,
    }))
    .sort((a, b) => b.avgViews - a.avgViews)
    .slice(0, 10);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Trophy className="w-5 h-5 text-primary" />
          Competitor Leaderboard
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Top 10 by average views per reel
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              layout="vertical"
              margin={{ top: 10, right: 20, left: 60, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis 
                type="number"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                tickFormatter={(value) => formatNumber(value)}
              />
              <YAxis 
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                width={80}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number) => [formatNumber(value), "Avg Views"]}
              />
              <Bar 
                dataKey="avgViews" 
                fill="hsl(var(--primary))" 
                radius={[0, 4, 4, 0]}
                className="transition-opacity hover:opacity-80"
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
