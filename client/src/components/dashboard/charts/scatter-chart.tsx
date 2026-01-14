import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Timer } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface DurationScatterChartProps {
  reels: Reel[];
}

export function DurationScatterChart({ reels }: DurationScatterChartProps) {
  const data = reels.slice(0, 100).map((reel) => ({
    duration: reel.durationSeconds,
    views: reel.views,
    username: reel.username,
    engagement: parseFloat(String(reel.engagementRate)),
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Timer className="w-5 h-5 text-primary" />
          Duration vs Views
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Analyze the relationship between video length and performance
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                type="number" 
                dataKey="duration" 
                name="Duration" 
                unit="s"
                tick={{ fontSize: 12 }}
                className="fill-muted-foreground"
                label={{ value: "Duration (seconds)", position: "bottom", offset: 0, fontSize: 12 }}
              />
              <YAxis 
                type="number" 
                dataKey="views" 
                name="Views"
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
                formatter={(value: number, name: string) => {
                  if (name === "Views") return [formatNumber(value), "Views"];
                  if (name === "Duration") return [`${value}s`, "Duration"];
                  return [value, name];
                }}
                content={({ payload }) => {
                  if (!payload || payload.length === 0) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border rounded-lg p-3 shadow-lg">
                      <p className="font-mono text-sm">@{data.username}</p>
                      <p className="text-sm text-muted-foreground">
                        {data.duration}s · {formatNumber(data.views)} views
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(data.engagement * 100).toFixed(2)}% engagement
                      </p>
                    </div>
                  );
                }}
              />
              <Scatter name="Reels" data={data} fill="hsl(var(--primary))">
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={`hsl(var(--primary) / ${0.3 + (entry.engagement * 5)})`}
                    className="transition-opacity hover:opacity-100"
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
