import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import type { Reel } from "@shared/schema";

interface HeatmapChartProps {
  reels: Reel[];
  metric?: "views" | "engagement";
}

const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hours = Array.from({ length: 24 }, (_, i) => i);

export function HeatmapChart({ reels, metric = "views" }: HeatmapChartProps) {
  const grid: { day: number; hour: number; values: number[] }[][] = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, (_, hour) => ({ day: 0, hour, values: [] }))
  );

  reels.forEach((reel) => {
    if (!reel.postedAt) return;
    const date = new Date(reel.postedAt);
    const day = date.getDay();
    const hour = date.getHours();
    const value = metric === "views" ? reel.views : parseFloat(String(reel.engagementRate));
    grid[day][hour].values.push(value);
  });

  const data = grid.flatMap((dayRow, dayIndex) =>
    dayRow.map((cell, hourIndex) => ({
      day: dayIndex,
      hour: hourIndex,
      value: cell.values.length > 0
        ? cell.values.reduce((a, b) => a + b, 0) / cell.values.length
        : 0,
      count: cell.values.length,
    }))
  );

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = Math.min(...data.filter((d) => d.value > 0).map((d) => d.value), 0);

  const getColor = (value: number): string => {
    if (value === 0) return "bg-muted/30";
    const intensity = (value - minValue) / (maxValue - minValue);
    if (intensity < 0.25) return "bg-primary/20";
    if (intensity < 0.5) return "bg-primary/40";
    if (intensity < 0.75) return "bg-primary/60";
    return "bg-primary";
  };

  const bestTime = data.reduce((best, current) =>
    current.value > best.value ? current : best,
    data[0]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Posting Time Heatmap
        </CardTitle>
        {bestTime && bestTime.value > 0 && (
          <p className="text-sm text-muted-foreground">
            Best time: <span className="font-medium text-primary">{days[bestTime.day]}</span> at{" "}
            <span className="font-medium">{bestTime.hour}:00</span> ({metric === "views" ? formatNumber(Math.round(bestTime.value)) + " avg views" : (bestTime.value * 100).toFixed(2) + "% engagement"})
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex gap-1">
              <div className="w-10" />
              {hours.filter((_, i) => i % 3 === 0).map((hour) => (
                <div
                  key={hour}
                  className="w-10 text-center text-xs text-muted-foreground"
                  style={{ marginLeft: hour > 0 ? "8px" : 0 }}
                >
                  {hour}:00
                </div>
              ))}
            </div>
            {days.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-1 mt-1">
                <div className="w-10 text-xs text-muted-foreground text-right pr-2">
                  {day}
                </div>
                {hours.map((hour) => {
                  const cell = data.find((d) => d.day === dayIndex && d.hour === hour);
                  const value = cell?.value || 0;
                  const count = cell?.count || 0;
                  
                  return (
                    <Tooltip key={hour}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "w-4 h-4 rounded-sm cursor-pointer transition-transform hover:scale-110",
                            getColor(value)
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs">
                          <div className="font-medium">{day} {hour}:00</div>
                          <div>{count} reels</div>
                          {value > 0 && (
                            <div>
                              {metric === "views"
                                ? `${formatNumber(Math.round(value))} avg views`
                                : `${(value * 100).toFixed(2)}% engagement`}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        
        <div className="flex items-center justify-end gap-2 mt-4 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted/30" />
            <div className="w-3 h-3 rounded-sm bg-primary/20" />
            <div className="w-3 h-3 rounded-sm bg-primary/40" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary" />
          </div>
          <span>More</span>
        </div>
      </CardContent>
    </Card>
  );
}
