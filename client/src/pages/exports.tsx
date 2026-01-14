import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Download, FileSpreadsheet, Lock, Users, Play } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { Profile, FetchRun, Reel, CompetitorStats } from "@shared/schema";

export default function ExportsPage() {
  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const { data: latestFetch } = useQuery<{ fetchRun: FetchRun; reels: Reel[]; stats: CompetitorStats[] } | null>({
    queryKey: ["/api/fetch/latest"],
  });

  const canExport = profile?.csvExport || profile?.role === "admin";
  const hasData = latestFetch && latestFetch.reels.length > 0;

  const handleExport = (type: "reels" | "competitors") => {
    if (!latestFetch?.fetchRun.id) return;
    window.open(`/api/export/${type}.csv?runId=${latestFetch.fetchRun.id}`, "_blank");
  };

  if (!canExport) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Download className="w-6 h-6" />
            Exports
          </h1>
          <p className="text-muted-foreground">Export your data as CSV files</p>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-semibold mb-2">CSV Export is a Pro Feature</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Upgrade to Pro to export your competitor analysis data as CSV files for further analysis in Excel or other tools.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" data-testid="button-contact-admin">
                Contact Admin to Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Download className="w-6 h-6" />
          Exports
        </h1>
        <p className="text-muted-foreground">Export your data as CSV files</p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No Data to Export"
          description="Run a fetch first to analyze competitor data, then come back to export it."
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Play className="w-5 h-5 text-primary" />
                Reels Export
              </CardTitle>
              <CardDescription>
                Export all analyzed reels with metrics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total reels</span>
                  <span className="font-medium">{formatNumber(latestFetch.reels.length)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Includes</span>
                  <span className="font-medium">Views, Likes, Comments, Engagement</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => handleExport("reels")}
                data-testid="button-export-reels"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Reels CSV
              </Button>
            </CardContent>
          </Card>

          <Card className="hover-elevate">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Competitors Export
              </CardTitle>
              <CardDescription>
                Export competitor summary statistics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total competitors</span>
                  <span className="font-medium">{latestFetch.stats.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Includes</span>
                  <span className="font-medium">Followers, Avg Views, Top Reels</span>
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => handleExport("competitors")}
                data-testid="button-export-competitors"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Competitors CSV
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
