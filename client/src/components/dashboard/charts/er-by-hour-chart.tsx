import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Reel } from "@shared/schema";

interface ERByHourChartProps {
  reels: Reel[];
}

export function ERByHourChart({ reels }: ERByHourChartProps) {
  const hourData = Array.from({ length: 24 }, (_, hour) => {
    const hourReels = reels.filter(r => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getHours() === hour;
    });
    const avgER = hourReels.length > 0
      ? hourReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / hourReels.length * 100
      : 0;
    return {
      hour: hour.toString().padStart(2, '0'),
      avgER,
      count: hourReels.length,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Average ER by Upload Hour</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourData}>
              <XAxis 
                dataKey="hour" 
                tick={{ fontSize: 10 }}
                label={{ value: "hour", position: "insideBottom", offset: -5 }}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                label={{ value: "ER %", angle: -90, position: "insideLeft" }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
                labelFormatter={(label) => `Hour: ${label}:00`}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Bar dataKey="avgER" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
