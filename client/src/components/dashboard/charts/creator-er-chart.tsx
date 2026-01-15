import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { CompetitorStats } from "@shared/schema";

interface CreatorERChartProps {
  stats: CompetitorStats[];
}

export function CreatorERChart({ stats }: CreatorERChartProps) {
  const data = stats
    .map(s => ({
      username: s.username,
      avgER: parseFloat(String(s.avgEngagementRate)) * 100,
    }))
    .sort((a, b) => b.avgER - a.avgER)
    .slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top Creators by Avg ER (%)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="horizontal">
              <XAxis 
                dataKey="username" 
                tick={{ fontSize: 10 }} 
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                formatter={(value: number) => [`${value.toFixed(2)}%`, "Avg ER"]}
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
