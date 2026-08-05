import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { HelpText } from "@/components/analytics/HelpText";
import { METRIC_HELP } from "@/lib/metric-help";
import type { Reel } from "@shared/schema";

interface ERByHourChartProps {
  reels: Reel[];
}

export function ERByHourChart({ reels }: ERByHourChartProps) {
  const hourData = Array.from({ length: 24 }, (_, hour) => {
    const hourReels = reels.filter(r => r.postedAt && new Date(r.postedAt).getHours() === hour);
    const avgER = hourReels.length > 0
      ? hourReels.reduce((sum, r) => sum + parseFloat(String(r.engagementRate)), 0) / hourReels.length * 100 : 0;
    return { hour: hour.toString().padStart(2, "0"), avgER, count: hourReels.length };
  });

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-tight font-semibold text-[16px] text-text-primary">Avg ER by Upload Hour</h3>
          <HelpText {...METRIC_HELP.erByHour} />
        </div>
        <p className="font-mono text-[11px] text-text-muted">Engagement rate per posting hour (your local time)</p>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={hourData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontFamily: "JetBrains Mono", fontSize: 10, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <YAxis tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }} axisLine={{ stroke: "#1F2227" }} tickLine={false} />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
              labelFormatter={(label) => `Hour: ${label}:00`}
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              itemStyle={{ color: "#7CFFB2" }}
            />
            <Bar dataKey="avgER" fill="#7CFFB2" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="font-mono text-[11px] text-text-muted italic border-t border-border-subtle pt-3 mt-4">
        💡 When your niche's audience is most active. Bar height shows engagement rate at each hour of the day.
      </p>
    </div>
  );
}

