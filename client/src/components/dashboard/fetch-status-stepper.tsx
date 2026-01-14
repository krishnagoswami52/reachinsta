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
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Fetch Failed</p>
            <p className="text-sm text-muted-foreground">
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
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      isCompleted && "bg-primary border-primary text-primary-foreground",
                      isCurrent && "border-primary bg-primary/10",
                      !isCompleted && !isCurrent && "border-muted bg-muted/50 text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-5 h-5" />
                    ) : isCurrent ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <Clock className="w-4 h-4" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs font-medium text-center",
                      (isCompleted || isCurrent) ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-2",
                      isCompleted ? "bg-primary" : "bg-muted"
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
