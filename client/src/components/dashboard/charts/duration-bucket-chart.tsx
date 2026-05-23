import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface DurationBucketChartProps {
  reels: Reel[];
}

const BUCKETS = [
  { label: "<10s",   min: 0,   max: 10 },
  { label: "10-20s", min: 10,  max: 20 },
  { label: "20-30s", min: 20,  max: 30 },
  { label: "30-45s", min: 30,  max: 45 },
  { label: "45-60s", min: 45,  max: 60 },
  { label: "60-90s", min: 60,  max: 90 },
  { label: "90-120s",min: 90,  max: 120 },
  { label: ">120s",  min: 120, max: Infinity },
];

export function DurationBucketChart({ reels }: DurationBucketChartProps) {
  const data = BUCKETS.map(bucket => {
    const bucketReels = reels.filter(r => r.durationSeconds >= bucket.min && r.durationSeconds < bucket.max);
    const avgViews = bucketReels.length > 0 ? bucketReels.reduce((sum, r) => sum + r.views, 0) / bucketReels.length : 0;
    return { label: bucket.label, avgViews: Math.round(avgViews), count: bucketReels.length };
  });

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <h3 className="font-tight font-semibold text-[16px] text-text-primary mb-1">Avg Views by Duration</h3>
        <p className="font-mono text-[11px] text-text-muted">Average views per reel by duration bucket</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis dataKey="label" tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip
              formatter={(value: number) => [formatNumber(value), "Avg Views"]}
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
            />
            <Bar dataKey="avgViews" fill="#7CFFB2" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

