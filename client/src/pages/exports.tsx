import { useQuery } from "@tanstack/react-query";
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
      <div className="space-y-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Download className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
            <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary leading-none">Exports</h1>
          </div>
          <p className="font-mono text-[12px] text-text-muted">Export your data as CSV files</p>
        </div>

        <div className="max-w-lg">
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 text-center">
            <div className="w-14 h-14 rounded-lg bg-bg-elevated border border-border-subtle flex items-center justify-center mx-auto mb-6">
              <Lock className="w-6 h-6 text-text-muted" strokeWidth={1.5} />
            </div>
            <h3 className="font-tight font-semibold text-[20px] text-text-primary mb-2">CSV Export is a Pro Feature</h3>
            <p className="font-mono text-[12px] text-text-secondary mb-6 leading-relaxed">
              Upgrade to Pro to export your competitor analysis data as CSV files for further analysis in Excel or other tools.
            </p>
            <button
              className="px-4 py-2 bg-bg-elevated border border-border-soft rounded-md font-mono text-[12px] text-text-secondary hover:text-text-primary hover:border-border-soft transition-colors"
              data-testid="button-contact-admin"
            >
              Contact Admin to Upgrade
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Download className="w-5 h-5 text-text-secondary" strokeWidth={1.5} />
          <h1 className="font-tight font-bold text-[36px] tracking-tightest text-text-primary leading-none">Exports</h1>
        </div>
        <p className="font-mono text-[12px] text-text-muted">Export your data as CSV files</p>
      </div>

      {!hasData ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="No Data to Export"
          description="Run a fetch first to analyze competitor data, then come back to export it."
        />
      ) : (
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 hover:border-border-soft transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Play className="w-4 h-4 text-mint" strokeWidth={1.5} />
              <h3 className="font-tight font-semibold text-[16px] text-text-primary">Reels Export</h3>
            </div>
            <p className="font-mono text-[11px] text-text-muted mb-6">Export all analyzed reels with metrics</p>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-muted">// TOTAL REELS</span>
                <span className="font-mono text-[13px] text-text-primary">{formatNumber(latestFetch.reels.length)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-muted">// INCLUDES</span>
                <span className="font-mono text-[11px] text-text-secondary">Views, Likes, Comments, ER</span>
              </div>
            </div>

            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-mint hover:bg-mint-hover text-bg-base rounded-md font-mono text-[13px] font-medium transition-colors"
              onClick={() => handleExport("reels")}
              data-testid="button-export-reels"
            >
              <Download className="w-4 h-4" />
              Download Reels CSV
            </button>
          </div>

          <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 hover:border-border-soft transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-mint" strokeWidth={1.5} />
              <h3 className="font-tight font-semibold text-[16px] text-text-primary">Competitors Export</h3>
            </div>
            <p className="font-mono text-[11px] text-text-muted mb-6">Export competitor summary statistics</p>

            <div className="space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-muted">// TOTAL COMPETITORS</span>
                <span className="font-mono text-[13px] text-text-primary">{latestFetch.stats.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-text-muted">// INCLUDES</span>
                <span className="font-mono text-[11px] text-text-secondary">Followers, Avg Views, Top Reels</span>
              </div>
            </div>

            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-mint hover:bg-mint-hover text-bg-base rounded-md font-mono text-[13px] font-medium transition-colors"
              onClick={() => handleExport("competitors")}
              data-testid="button-export-competitors"
            >
              <Download className="w-4 h-4" />
              Download Competitors CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
