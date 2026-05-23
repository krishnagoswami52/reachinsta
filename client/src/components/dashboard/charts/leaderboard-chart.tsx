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
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Trophy className="w-4 h-4 text-mint" strokeWidth={1.5} />
        <h3 className="font-tight font-semibold text-[16px] text-text-primary">Competitor Leaderboard</h3>
      </div>
      <p className="font-mono text-[11px] text-text-muted mb-6">Top 10 by average views per reel</p>
      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
              formatter={(value: number) => [formatNumber(value), "Avg Views"]}
            />
            <Bar dataKey="avgViews" fill="#7CFFB2" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
