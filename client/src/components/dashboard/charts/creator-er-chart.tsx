import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HelpText } from "@/components/analytics/HelpText";
import { METRIC_HELP } from "@/lib/metric-help";
import type { CompetitorStats } from "@shared/schema";

interface CreatorERChartProps {
  stats: CompetitorStats[];
}

export function CreatorERChart({ stats }: CreatorERChartProps) {
  const data = stats
    .map(s => ({
      username: s.username,
      avgER: parseFloat(String(s.avgEngagementRate)) * 100,
    }))
    .sort((a, b) => b.avgER - a.avgER)
    .slice(0, 15);

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">Top Creators by Avg ER (%)</h3>
          <HelpText {...METRIC_HELP.topCreatorsByER} />
        </div>
        <p className="font-mono text-[11px] text-text-muted">Engagement rate per creator</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data} layout="horizontal">
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis
              dataKey="username"
              tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
            />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
            />
            <Bar dataKey="avgER" fill="#7CFFB2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-mono text-[11px] text-text-muted italic border-t border-border-subtle pt-3 mt-4">
        💡 Small accounts with high ER often outperform big accounts with low ER. Study these creators' content style, not just their size.
      </p>
    </div>
  );
}

