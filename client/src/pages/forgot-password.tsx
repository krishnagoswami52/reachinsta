import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  useEffect(() => { document.title = "Forgot password - ReachInsta"; }, []);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"form" | "success">("form");
  const [sentEmail, setSentEmail] = useState("");

  const requestCodeMutation = useMutation({
    mutationFn: async (data: { email: string }) => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Failed to send reset code");
      }
      return response.json();
    },
    onSuccess: () => {
      setSentEmail(email);
      setStage("success");
      // Auto-redirect after 3s
      let count = 3;
      const timer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          setLocation(`/reset-password?email=${encodeURIComponent(email)}`);
        }
      }, 1000);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestCodeMutation.mutate({ email });
  };

  const [step1, setStep1] = useState<"active" | "done">("active");
  const [step2, setStep2] = useState<"pending" | "active">("pending");
  useEffect(() => {
    if (stage === "success") {
      setStep1("done");
      setStep2("active");
    }
  }, [stage]);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary grid grid-cols-1 lg:grid-cols-[60fr_40fr]">

      {/* LEFT 60% */}
      <div className="auth-bg relative flex flex-col px-6 lg:px-16 py-8 lg:py-12">
        <div className="mb-12">
          <a href="/" className="inline-flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" stroke="#7CFFB2"/>
              <path d="M8 6L16 11L8 16V6Z" fill="#7CFFB2"/>
            </svg>
            <span className="font-tight font-semibold text-[18px] tracking-tighter-2">ReachInsta</span>
          </a>
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[440px]">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // PASSWORD RESET
            </div>

            {stage === "form" ? (
              <>
                <h1 className="font-tight font-bold text-[44px] lg:text-[52px] leading-[1.05] tracking-tightest mb-5">
                  Forgot your<br/>password?
                </h1>
                <p className="text-[16px] text-text-secondary leading-relaxed mb-10 max-w-[420px]">
                  Happens to the best of us. Drop your email and we&apos;ll send a 6-digit code &mdash; valid for{" "}
                  <span className="font-mono text-mint">15 minutes</span>.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2" htmlFor="email">
                      // EMAIL
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@yourdomain.com"
                      autoComplete="email"
                      required
                      className="auth-input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={requestCodeMutation.isPending}
                    className="w-full bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] py-3.5 rounded-md inline-flex items-center justify-center gap-2 mt-2 transition-all disabled:opacity-60"
                  >
                    {requestCodeMutation.isPending ? (
                      <><span className="spinner" />Sending...</>
                    ) : (
                      <>Send me the code <ArrowIcon /></>
                    )}
                  </button>
                </form>
              </>
            ) : (
              <div className="animate-fade-up">
                {/* Envelope SVG */}
                <svg width="56" height="56" viewBox="0 0 56 56" fill="none" className="mb-6">
                  <rect x="6" y="14" width="44" height="32" rx="4" stroke="#7CFFB2" strokeWidth="1.5" fill="none" className="env-path"/>
                  <path d="M6 18 L28 32 L50 18" stroke="#7CFFB2" strokeWidth="1.5" fill="none" className="env-path" style={{ animationDelay: "0.4s" }}/>
                  <circle cx="46" cy="14" r="4" fill="#7CFFB2" opacity="0">
                    <animate attributeName="opacity" values="0;1;1" dur="0.4s" begin="1.5s" fill="freeze"/>
                  </circle>
                </svg>

                <h1 className="font-tight font-bold text-[40px] lg:text-[44px] leading-[1.05] tracking-tightest mb-4">
                  Check your inbox.
                </h1>
                <p className="text-[16px] text-text-secondary leading-relaxed mb-8 max-w-[420px]">
                  We sent a 6-digit code to{" "}
                  <span className="font-mono text-mint">{sentEmail}</span>.
                  Heading to the next step in a moment&hellip;
                </p>

                <div className="flex items-center gap-4 flex-wrap">
                  <a
                    href={`/reset-password?email=${encodeURIComponent(sentEmail)}`}
                    className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-3 rounded-md inline-flex items-center justify-center gap-2 transition-all"
                  >
                    Continue to code entry <ArrowIcon />
                  </a>
                  <button
                    onClick={() => { setStage("form"); setEmail(""); }}
                    className="font-mono text-[12px] text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Wrong email? Try again
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-border-subtle">
              <p className="text-[14px] text-text-secondary">
                Remembered it?{" "}
                <a href="/login" className="text-mint hover:underline ml-1 font-medium">Sign in &rarr;</a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-3 max-w-[440px]">
          <a href="/" className="font-mono text-[12px] text-text-muted hover:text-text-secondary transition-colors inline-flex items-center gap-1">
            &larr; Back to home
          </a>
          <p className="font-mono text-[11px] text-text-muted leading-relaxed">
            Didn&apos;t get the code in 2 minutes? Check spam &mdash; sometimes Gmail is moody. Or email{" "}
            <a href="mailto:kk@reachinsta.com" className="text-mint hover:underline">kk@reachinsta.com</a>{" "}
            and I&apos;ll reset it manually.
          </p>
          <p className="font-mono text-[11px] text-text-muted italic leading-relaxed">
            PS: We don&apos;t lock accounts after failed attempts. We just slow them down. So no panic.
          </p>
        </div>
      </div>

      {/* RIGHT 40% — 4-step timeline */}
      <div className="bg-bg-surface relative flex flex-col px-6 lg:px-12 py-12 lg:py-16 border-l border-border-subtle min-h-[400px] lg:min-h-screen">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-2">
          // HOW THIS WORKS
        </div>
        <p className="text-[13px] text-text-secondary mb-12 max-w-[340px]">
          4-step reset. Average time: <span className="font-mono text-mint">under 90 seconds</span>.
        </p>

        <div className="flex-1 flex flex-col justify-center max-w-[360px] w-full">
          <div className="space-y-0">
            <TimelineStep num="1" state={step1} title="Enter your email" meta="We'll look up your account. Same response if you exist or not — no enumeration leaks." />
            <TimelineStep num="2" state={step2} title="Get a 6-digit code" meta="Lands in your inbox in ~10s. Valid for 15 minutes, then it expires." />
            <TimelineStep num="3" state="pending" title="Enter the code" meta="Paste or type into 6 boxes. We slow down repeated failed attempts." />
            <TimelineStep num="4" state="pending" title="Set a new password" meta="8+ chars. Bcrypt-hashed before storing. We never see it again." last />
          </div>

          <div className="mt-12 pt-6 border-t border-border-subtle flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint pulse-dot" />
            <p className="font-mono text-[11px] text-text-secondary">
              {stage === "form" ? "waiting for your email…" : `code sent to ${sentEmail}`}
            </p>
          </div>
        </div>

        <div className="mt-12 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          // built in udaipur &#9749;
        </div>
      </div>
    </div>
  );
}

function TimelineStep({ num, state, title, meta, last = false }: {
  num: string;
  state: "active" | "done" | "pending";
  title: string;
  meta: string;
  last?: boolean;
}) {
  return (
    <div className={`relative pl-9 ${last ? "pb-0" : "pb-7"}`}>
      {!last && (
        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border-subtle" />
      )}
      <div className={`absolute left-0 top-0 w-6 h-6 rounded-full flex items-center justify-center font-mono text-[11px] z-10 transition-all ${
        state === "done" ? "bg-mint border border-mint text-bg-base" :
        state === "active" ? "bg-mint-dim border border-mint text-mint shadow-[0_0_0_4px_rgba(124,255,178,0.08)]" :
        "bg-bg-base border border-border-subtle text-text-muted opacity-50"
      }`}>
        {state === "done" ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6L5 9L10 3" stroke="#0A0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : num}
      </div>
      <div className={`font-tight font-semibold text-[14px] tracking-tighter-2 mb-1 ${state === "pending" ? "text-text-secondary" : "text-text-primary"}`}>
        {title}
      </div>
      <p className={`font-mono text-[11px] leading-relaxed ${state === "active" ? "text-text-secondary" : "text-text-muted"}`}>
        {meta}
      </p>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
