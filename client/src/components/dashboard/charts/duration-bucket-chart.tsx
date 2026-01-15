import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface DurationBucketChartProps {
  reels: Reel[];
}

const BUCKETS = [
  { label: "<10s", min: 0, max: 10 },
  { label: "10-20s", min: 10, max: 20 },
  { label: "20-30s", min: 20, max: 30 },
  { label: "30-45s", min: 30, max: 45 },
  { label: "45-60s", min: 45, max: 60 },
  { label: "60-90s", min: 60, max: 90 },
  { label: "90-120s", min: 90, max: 120 },
  { label: ">120s", min: 120, max: Infinity },
];

export function DurationBucketChart({ reels }: DurationBucketChartProps) {
  const data = BUCKETS.map(bucket => {
    const bucketReels = reels.filter(r => 
      r.durationSeconds >= bucket.min && r.durationSeconds < bucket.max
    );
    const avgViews = bucketReels.length > 0 
      ? bucketReels.reduce((sum, r) => sum + r.views, 0) / bucketReels.length 
      : 0;
    return {
      label: bucket.label,
      avgViews: Math.round(avgViews),
      count: bucketReels.length,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Average Views by Duration Bucket</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis 
                tick={{ fontSize: 11 }} 
                tickFormatter={(value) => formatNumber(value)}
              />
              <Tooltip 
                formatter={(value: number) => [formatNumber(value), "Avg Views"]}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Bar dataKey="avgViews" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
