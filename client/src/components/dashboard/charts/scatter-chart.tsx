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
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="w-4 h-4 text-text-secondary" strokeWidth={1.5} />
        <h3 className="font-tight font-semibold text-[16px] text-text-primary">Duration vs Views</h3>
      </div>
      <p className="font-mono text-[11px] text-text-muted mb-4">
        Relationship between video length and performance
      </p>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2227" />
            <XAxis
              type="number"
              dataKey="duration"
              name="Duration"
              unit="s"
              tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
              label={{ value: "Duration (s)", position: "bottom", offset: 0, fontSize: 11, fill: "#5A6069", fontFamily: "JetBrains Mono" }}
            />
            <YAxis
              type="number"
              dataKey="views"
              name="Views"
              tick={{ fontFamily: "JetBrains Mono", fontSize: 11, fill: "#5A6069" }}
              axisLine={{ stroke: "#1F2227" }}
              tickLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />
            <Tooltip
              contentStyle={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", fontFamily: "JetBrains Mono", fontSize: "12px" }}
              labelStyle={{ color: "#8B9199" }}
              content={({ payload }) => {
                if (!payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div style={{ backgroundColor: "#111316", border: "1px solid #1F2227", borderRadius: "6px", padding: "10px 12px", fontFamily: "JetBrains Mono", fontSize: "12px" }}>
                    <p style={{ color: "#E8EAED" }}>@{d.username}</p>
                    <p style={{ color: "#8B9199" }}>{d.duration}s · {formatNumber(d.views)} views</p>
                    <p style={{ color: "#7CFFB2" }}>{(d.engagement * 100).toFixed(2)}% eng</p>
                  </div>
                );
              }}
            />
            <Scatter name="Reels" data={data} fill="#7CFFB2">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={`rgba(124,255,178,${Math.min(0.2 + (entry.engagement * 5), 1)})`} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
