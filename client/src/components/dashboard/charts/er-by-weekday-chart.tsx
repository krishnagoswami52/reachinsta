import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { Reel } from "@shared/schema";

interface ERByWeekdayChartProps {
  reels: Reel[];
}

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function ERByWeekdayChart({ reels }: ERByWeekdayChartProps) {
  const dayData = DAYS.map((day, index) => {
    const dayReels = reels.filter(r => r.postedAt && new Date(r.postedAt).getDay() === index);
    const avgER = dayReels.length > 0
      ? dayReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / dayReels.length * 100 : 0;
    return { day: day.slice(0, 3), fullDay: day, avgER, count: dayReels.length };
  });

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <h3 className="font-tight font-semibold text-[16px] text-text-primary mb-1">Avg ER by Weekday</h3>
        <p className="font-mono text-[11px] text-text-muted">Average engagement rate per day of the week</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={dayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis dataKey="day" tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
              labelFormatter={(_, payload) => payload[0]?.payload.fullDay || ""}
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

