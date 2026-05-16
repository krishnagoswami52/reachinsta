import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
        <h3 className="font-tight font-semibold text-[16px] text-text-primary mb-1">Top Creators by Avg ER (%)</h3>
        <p className="font-mono text-[11px] text-text-muted">Engagement rate per creator</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
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
    </div>
  );
}
