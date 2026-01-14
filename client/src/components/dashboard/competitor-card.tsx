import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { ExternalLink, Users, Play, TrendingUp } from "lucide-react";
import type { CompetitorStats } from "@shared/schema";

interface CompetitorCardProps {
  stats: CompetitorStats;
  isSelected?: boolean;
  onSelect?: () => void;
}

export function CompetitorCard({ stats, isSelected, onSelect }: CompetitorCardProps) {
  return (
    <Card 
      className={`hover-elevate cursor-pointer transition-all ${isSelected ? "ring-2 ring-primary" : ""}`}
      onClick={onSelect}
      data-testid={`competitor-card-${stats.username}`}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {stats.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-medium">@{stats.username}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`https://instagram.com/${stats.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
              {stats.followers ? (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {formatNumber(stats.followers)} followers
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Followers unknown</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1">
              <Play className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold">{stats.reelsCount}</p>
            <p className="text-xs text-muted-foreground">Reels</p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold">{formatNumber(parseFloat(String(stats.avgViews)))}</p>
            <p className="text-xs text-muted-foreground">Avg Views</p>
          </div>
          <div className="space-y-1">
            <Badge variant="secondary" className="text-xs">
              {(parseFloat(String(stats.avgEngagementRate)) * 100).toFixed(2)}%
            </Badge>
            <p className="text-xs text-muted-foreground mt-1">Engagement</p>
          </div>
        </div>

        {stats.topReelViews > 0 && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Top Reel</span>
              <span className="font-medium">{formatNumber(stats.topReelViews)} views</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
