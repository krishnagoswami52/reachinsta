/**
 * Local-only visual harness for the queue UI. Not routed, not built into the
 * app — `npx vite --port 5199` then /queue-preview.html.
 *
 * Stubs window.fetch so the real QueuePositionCard renders every state
 * without a server, a session, or a job that would spend Apify credit.
 */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FetchStatusStepper } from "@/components/dashboard/fetch-status-stepper";
import { QueuePositionCard } from "@/components/dashboard/queue-position-card";
import "./index.css";

const STATES: Record<string, any> = {
  "run-pro": {
    status: "queued", position: 2, ahead_of_you: 1, estimated_wait_seconds: 63,
    worker_slots_busy: 5, worker_slots_total: 5, your_priority: "pro", queue_priority: 1,
    message: "#2 in the priority queue — 1 fetch ahead of you. Starting in about 1 min.",
  },
  "run-free-next": {
    status: "queued", position: 1, ahead_of_you: 0, estimated_wait_seconds: 0,
    worker_slots_busy: 3, worker_slots_total: 5, your_priority: "free", queue_priority: 3,
    message: "You're next — your fetch starts in a moment.",
  },
  "run-free-long": {
    status: "queued", position: 27, ahead_of_you: 26, estimated_wait_seconds: 378,
    worker_slots_busy: 5, worker_slots_total: 5, your_priority: "free", queue_priority: 3,
    message: "#27 in the queue — 26 fetches ahead of you. About 6 min to go.",
  },
};

const realFetch = window.fetch;
window.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input.url);
  if (url.includes("/api/fetch/queue-position")) {
    const runId = new URL(url, location.origin).searchParams.get("run_id")!;
    return new Response(JSON.stringify(STATES[runId]), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function Panel({ label, runId }: { label: string; runId: string }) {
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] text-text-muted uppercase tracking-wider">{label}</p>
      <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
        <FetchStatusStepper status="queued" />
        <div className="mt-5">
          <QueuePositionCard runId={runId} isActive />
        </div>
        <p className="text-center text-[13px] text-text-muted mt-4">
          Estimated time: 3–5 minutes. Please wait while we fetch your data.
        </p>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={qc}>
    <div className="min-h-screen bg-bg-base p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <Panel label="Pro user — position 2, pool saturated" runId="run-pro" />
        <Panel label="Free user — next up" runId="run-free-next" />
        <Panel label="Free user — 6 min wait, upgrade CTA" runId="run-free-long" />
      </div>
    </div>
  </QueryClientProvider>,
);
