import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Timer } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface DurationChartProps {
  reels: Reel[];
}

const buckets = [
  { label: "0-10s", min: 0, max: 10 },
  { label: "11-20s", min: 11, max: 20 },
  { label: "21-30s", min: 21, max: 30 },
  { label: "31-45s", min: 31, max: 45 },
  { label: "46-60s", min: 46, max: 60 },
  { label: "60s+", min: 61, max: Infinity },
];

export function DurationChart({ reels }: DurationChartProps) {
  const data = buckets.map((bucket) => {
    const bucketReels = reels.filter(
      (r) => r.durationSeconds >= bucket.min && r.durationSeconds <= bucket.max
    );
    const count = bucketReels.length;
    const avgViews = count > 0 
      ? bucketReels.reduce((sum, r) => sum + r.views, 0) / count 
      : 0;
    const avgEngagement = count > 0
      ? bucketReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / count
      : 0;

    return {
      name: bucket.label,
      count,
      avgViews: Math.round(avgViews),
      avgEngagement: (avgEngagement * 100).toFixed(2),
    };
  });

  const maxViews = Math.max(...data.map((d) => d.avgViews));
  const bestBucket = data.find((d) => d.avgViews === maxViews);

  const COLORS = ["#7CFFB2", "#8B9199", "#5A6069", "#2A2D32", "#1F2227", "#7CFFB2"];

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
        <h3 className="font-tight font-semibold text-[16px] text-text-primary">Duration Performance</h3>
      </div>
      {bestBucket && bestBucket.avgViews > 0 && (
        <p className="font-mono text-[11px] text-text-muted mb-4">
          Best: <span className="text-mint">{bestBucket.name}</span> — {formatNumber(bestBucket.avgViews)} avg views
        </p>
      )}
      <div className="h-[300px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis dataKey="name" tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
              formatter={(value: number, name: string) => [name === "avgViews" ? formatNumber(value) : `${value}%`, name === "avgViews" ? "Avg Views" : "Avg ER"]}
            />
            <Bar dataKey="avgViews" radius={[4, 4, 0, 0]}>
              {data.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
