import { Info } from "lucide-react";

export function MetricsNotes() {
  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">// Metric Definitions</span>
      </div>
      <ul className="space-y-2">
        <li className="font-mono text-[12px] text-text-secondary">
          <span className="text-text-primary">ER</span> = (likes + comments) / views × 100
        </li>
        <li className="font-mono text-[12px] text-text-secondary">
          <span className="text-text-primary">VR</span> = views / likes (lower is better; N/A if likes = 0)
        </li>
        <li className="font-mono text-[12px] text-text-secondary">
          <span className="text-text-primary">Viral Score</span> = weighted log-scale combo of views, likes, comments
        </li>
        <li className="font-mono text-[12px] text-text-secondary">
          <span className="text-text-primary">Duration buckets</span> identify optimal video length for your niche
        </li>
        <li className="font-mono text-[12px] text-text-secondary">
          Post timing is based on when competitors uploaded their reels, shown in your local time
        </li>
        <li className="font-mono text-[12px] text-text-secondary">
          Data is fetched on demand from public Instagram profiles — slight delays possible
        </li>
      </ul>
    </div>
  );
}
