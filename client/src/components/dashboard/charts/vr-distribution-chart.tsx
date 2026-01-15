import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Reel } from "@shared/schema";

interface VRDistributionChartProps {
  reels: Reel[];
}

export function VRDistributionChart({ reels }: VRDistributionChartProps) {
  const vrValues = reels
    .filter(r => r.likes > 0)
    .map(r => r.views / r.likes);

  const bucketSize = 25;
  const maxVR = Math.min(Math.max(...vrValues, 100), 500);
  const buckets: { range: string; count: number }[] = [];

  for (let i = 0; i < maxVR; i += bucketSize) {
    const count = vrValues.filter(v => v >= i && v < i + bucketSize).length;
    buckets.push({
      range: `${i}`,
      count,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribution of View-to-Like Ratio (lower is better)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets}>
              <XAxis 
                dataKey="range" 
                tick={{ fontSize: 10 }}
                label={{ value: "VR", position: "insideBottom", offset: -5 }}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                label={{ value: "count", angle: -90, position: "insideLeft" }}
              />
              <Tooltip 
                formatter={(value: number) => [value, "Reels"]}
                labelFormatter={(label) => `VR: ${label}-${parseInt(label) + bucketSize}`}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
