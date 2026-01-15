import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { Reel } from "@shared/schema";

interface ERByWeekdayChartProps {
  reels: Reel[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function ERByWeekdayChart({ reels }: ERByWeekdayChartProps) {
  const dayData = DAYS.map((day, index) => {
    const dayReels = reels.filter(r => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getDay() === index;
    });
    const avgER = dayReels.length > 0
      ? dayReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / dayReels.length * 100
      : 0;
    return {
      day: day.slice(0, 3),
      fullDay: day,
      avgER,
      count: dayReels.length,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Average ER by Weekday</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayData}>
              <XAxis 
                dataKey="day" 
                tick={{ fontSize: 11 }}
                label={{ value: "weekday", position: "insideBottom", offset: -5 }}
              />
              <YAxis 
                tick={{ fontSize: 11 }}
                label={{ value: "ER %", angle: -90, position: "insideLeft" }}
              />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
                labelFormatter={(_, payload) => payload[0]?.payload.fullDay || ""}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
              />
              <Bar dataKey="avgER" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
