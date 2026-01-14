import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const COLORS = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))",
    "hsl(var(--primary))",
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Timer className="w-5 h-5 text-primary" />
          Duration Performance
        </CardTitle>
        {bestBucket && bestBucket.avgViews > 0 && (
          <p className="text-sm text-muted-foreground">
            Best performing: <span className="font-medium text-primary">{bestBucket.name}</span> with{" "}
            <span className="font-medium">{formatNumber(bestBucket.avgViews)}</span> avg views
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
              />
              <YAxis 
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                tickFormatter={(value) => formatNumber(value)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={(value: number, name: string) => [
                  name === "avgViews" ? formatNumber(value) : `${value}%`,
                  name === "avgViews" ? "Avg Views" : "Avg Engagement",
                ]}
              />
              <Bar dataKey="avgViews" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={COLORS[index % COLORS.length]}
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
