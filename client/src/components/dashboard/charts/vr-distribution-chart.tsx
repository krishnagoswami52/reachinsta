import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Reel } from "@shared/schema";

interface VRDistributionChartProps {
  reels: Reel[];
}

export function VRDistributionChart({ reels }: VRDistributionChartProps) {
  const vrValues = reels.filter(r => r.likes > 0).map(r => r.views / r.likes);
  const bucketSize = 25;
  const maxVR = Math.min(Math.max(...vrValues, 100), 500);
  const buckets: { range: string; count: number }[] = [];
  for (let i = 0; i < maxVR; i += bucketSize) {
    buckets.push({ range: `${i}`, count: vrValues.filter(v => v >= i && v < i + bucketSize).length });
  }

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <h3 className="font-tight font-semibold text-[16px] text-text-primary mb-1">View-to-Like Ratio Distribution</h3>
        <p className="font-mono text-[11px] text-text-muted">Lower ratio = more engagement relative to views</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={buckets}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis dataKey="range" tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <Tooltip
              formatter={(value: number) => [value, "Reels"]}
              labelFormatter={(label) => `VR: ${label}â€“${parseInt(label) + bucketSize}`}
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
            />
            <Bar dataKey="count" fill="#7CFFB2" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

