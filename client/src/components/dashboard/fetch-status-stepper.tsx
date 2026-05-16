import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Clock } from "lucide-react";
import type { FetchStatusType } from "@shared/schema";

interface FetchStatusStepperProps {
  status: FetchStatusType;
  className?: string;
}

const steps: { key: FetchStatusType; label: string }[] = [
  { key: "queued", label: "Queued" },
  { key: "running", label: "Fetching" },
  { key: "merging", label: "Merging" },
  { key: "analyzing", label: "Analyzing" },
  { key: "completed", label: "Completed" },
];

const statusOrder: Record<FetchStatusType, number> = {
  queued: 0,
  running: 1,
  merging: 2,
  analyzing: 3,
  completed: 4,
  failed: -1,
};

export function FetchStatusStepper({ status, className }: FetchStatusStepperProps) {
  const currentStep = statusOrder[status];
  const isFailed = status === "failed";

  return (
    <div className={cn("w-full", className)}>
      {isFailed ? (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-danger/10 border border-danger/20">
          <AlertCircle className="w-5 h-5 text-danger" />
          <div>
            <p className="font-mono text-[13px] text-danger">Fetch Failed</p>
            <p className="font-mono text-[11px] text-text-muted">
              Something went wrong. Please try again.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = currentStep > index;
            const isCurrent = currentStep === index;

            return (
              <div key={step.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-md flex items-center justify-center border transition-all",
                      isCompleted && "bg-mint border-mint text-bg-base",
                      isCurrent && "border-mint bg-mint-dim text-mint",
                      !isCompleted && !isCurrent && "border-border-subtle bg-bg-elevated text-text-muted"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] text-center",
                      (isCompleted || isCurrent) ? "text-text-primary" : "text-text-muted"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-px flex-1 mx-2 mb-5",
                      isCompleted ? "bg-mint" : "bg-border-subtle"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
