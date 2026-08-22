import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Users, Zap } from "lucide-react";
import { Link } from "wouter";
import type { PlanType } from "@shared/schema";

/** Shape returned by GET /api/fetch/queue-position. */
export interface QueuePosition {
  status: "queued" | "running" | "merging" | "analyzing" | "completed" | "failed";
  position: number;
  ahead_of_you: number;
  estimated_wait_seconds: number;
  worker_slots_busy: number;
  worker_slots_total: number;
  your_priority: PlanType;
  queue_priority: number;
  message: string;
}

/**
 * Only pitch the upgrade when the wait is long enough that skipping it is a
 * real benefit. Below this it would be an interruption selling nothing.
 */
const UPGRADE_CTA_THRESHOLD_SECONDS = 5 * 60;

function formatWait(seconds: number): string {
  if (seconds <= 0) return "starting now";
  if (seconds < 60) return "under a minute";
  return `~${Math.round(seconds / 60)} min`;
}

interface QueuePositionCardProps {
  runId: string;
  /** Non-terminal status of the run, so polling stops the moment it finishes. */
  isActive: boolean;
}

/**
 * Live queue feedback for a fetch that has not started yet.
 *
 * Renders nothing once the job leaves the queue — the stepper already owns the
 * running / analyzing / completed states, and two progress widgets fighting
 * over the same panel reads as a bug.
 */
export function QueuePositionCard({ runId, isActive }: QueuePositionCardProps) {
  // Highest position this run has been seen at, so the bar can show real
  // movement. The server only knows where you are now, not where you started.
  const worstPosition = useRef(0);

  const { data } = useQuery<QueuePosition>({
    queryKey: ["/api/fetch/queue-position", runId],
    queryFn: async () => {
      const res = await fetch(`/api/fetch/queue-position?run_id=${encodeURIComponent(runId)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    // Matches the existing dashboard cadence: 5s while waiting, 3s once the
    // fetch is actually moving, and stop entirely on a terminal status.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "queued") return 5000;
      if (status === "running" || status === "merging" || status === "analyzing") return 3000;
      return false;
    },
    enabled: isActive && !!runId,
    staleTime: 0,
  });

  if (!data || data.status !== "queued") return null;

  worstPosition.current = Math.max(worstPosition.current, data.position);
  const start = worstPosition.current;
  const progressPct = start <= 1 ? 100 : Math.round(((start - data.position) / (start - 1)) * 100);

  const showUpgradeCta =
    data.your_priority === "free" &&
    data.estimated_wait_seconds > UPGRADE_CTA_THRESHOLD_SECONDS;

  return (
    <div
      className="bg-bg-elevated border border-border-subtle rounded-lg p-4 sm:p-5"
      data-testid="queue-position-card"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
            In queue
          </p>
          <p className="text-[13px] sm:text-[14px] text-text-secondary mt-1.5 leading-relaxed">
            {data.message}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span
            className="font-tight font-bold text-[28px] sm:text-[32px] leading-none text-mint tabular-nums"
            data-testid="text-queue-position"
          >
            #{data.position}
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between font-mono text-[11px] text-text-muted mb-1.5">
          <span>
            {data.ahead_of_you} ahead of you
          </span>
          <span>{formatWait(data.estimated_wait_seconds)}</span>
        </div>
        <div className="w-full bg-bg-base h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-mint h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(4, progressPct))}%` }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
        <Users className="w-3 h-3" strokeWidth={1.5} />
        <span>
          {data.worker_slots_busy} of {data.worker_slots_total} workers busy
        </span>
      </div>

      {showUpgradeCta && (
        <div
          className="mt-4 rounded-md border border-mint/30 bg-mint-dim p-3"
          data-testid="queue-upgrade-cta"
        >
          <div className="flex items-start gap-2">
            <Zap className="w-3.5 h-3.5 text-mint mt-0.5 shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-text-primary">Skip the queue</p>
              <p className="text-[12px] text-text-secondary mt-0.5 leading-relaxed">
                Pro fetches are served before free ones, so they start in seconds
                even when the queue is this busy.
              </p>
              <Link href="/pricing">
                <button className="mt-2 inline-flex items-center gap-1 text-[12px] text-mint hover:text-mint-hover transition-colors">
                  See Pro
                  <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
                </button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
