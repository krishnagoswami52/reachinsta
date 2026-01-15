import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function MetricsNotes() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4" />
          Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>• <strong>ER</strong> = (likes + comments) / views * 100</li>
          <li>• <strong>VR</strong> = views / likes (recomputed, lower is better). If likes=0, VR is not available.</li>
          <li>• <strong>Viral Score</strong> = weighted combination of views, likes, and comments (log scale).</li>
          <li>• <strong>Duration buckets</strong> help identify optimal video length for your niche.</li>
          <li>• Post timing analysis is based on when competitors uploaded their reels.</li>
          <li>• Data is fetched from Instagram via Apify and may have slight delays.</li>
        </ul>
      </CardContent>
    </Card>
  );
}
