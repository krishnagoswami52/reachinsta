import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  useEffect(() => { document.title = "Sign in - ReachInsta"; }, []);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  const loginMutation = useMutation({
    mutationFn: async (data: { email: string; password: string }) => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Login failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Welcome back!", description: "Login successful" });
      setLocation("/dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.getModifierState) setCapsOn(e.getModifierState("CapsLock"));
  };

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
              // WELCOME BACK
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[56px] leading-[1.05] tracking-tightest mb-5">
              Good to see you<br/>again.
            </h1>
            <p className="text-[16px] text-text-secondary leading-relaxed mb-10 max-w-[420px]">
              Pick up where you left off. Your competitors didn&apos;t stop posting.
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
                  data-testid="input-email"
                  className="auth-input"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-mono text-[11px] uppercase tracking-wider text-text-secondary" htmlFor="password">
                    // PASSWORD
                  </label>
                  {capsOn && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-danger">
                      &#9888; caps lock is on
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handleKeyUp}
                    placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    autoComplete="current-password"
                    required
                    data-testid="input-password"
                    className="auth-input pr-16"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors"
                  >
                    {showPassword ? "hide" : "show"}
                  </button>
                </div>
                <div className="flex justify-end mt-2">
                  <a href="/forgot-password" className="font-mono text-[11px] text-mint hover:underline">
                    Forgot password?
                  </a>
                </div>
              </div>

              <button
                type="submit"
                disabled={loginMutation.isPending}
                data-testid="button-submit-login"
                className="w-full bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] py-3.5 rounded-md inline-flex items-center justify-center gap-2 mt-2 transition-all disabled:opacity-60"
              >
                {loginMutation.isPending ? (
                  <><span className="spinner" />Signing in...</>
                ) : (
                  <>Sign in <ArrowIcon /></>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border-subtle">
              <p className="text-[14px] text-text-secondary">
                Don&apos;t have an account?{" "}
                <a href="/signup" className="text-mint hover:underline ml-1 font-medium">Create one &rarr;</a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-3">
          <a href="/" className="font-mono text-[12px] text-text-muted hover:text-text-secondary transition-colors inline-flex items-center gap-1">
            &larr; Back to home
          </a>
          <p className="font-mono text-[11px] text-text-muted max-w-[420px] leading-relaxed">
            Trouble logging in? Email{" "}
            <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>
            {" "}&mdash; a real human (me) replies within 12 hours.
          </p>
        </div>
      </div>

      {/* RIGHT 40% — Changelog panel */}
      <div className="bg-bg-surface relative flex flex-col px-6 lg:px-12 py-12 lg:py-16 border-l border-border-subtle min-h-[400px] lg:min-h-screen">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-2">
          // SINCE YOU WERE GONE
        </div>
        <p className="text-[13px] text-text-secondary mb-10 max-w-[360px]">
          A few things shipped while you were busy posting.
        </p>

        <div className="flex-1 flex flex-col justify-center max-w-[420px] w-full">
          <div className="space-y-3">
            <div className="slide-in bg-bg-base border border-border-subtle rounded-lg p-5 hover:border-border-soft hover:translate-x-0.5 transition-all" style={{ animationDelay: "0.2s" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="new-badge">&#9679; new</span>
                <span className="font-mono text-[10px] text-text-muted">released may 19</span>
              </div>
              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-1.5">Faster backend</h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                Upgraded server infra. Fetches feel snappier across the board.
              </p>
            </div>

            <div className="slide-in bg-bg-base border border-border-subtle rounded-lg p-5 hover:border-border-soft hover:translate-x-0.5 transition-all" style={{ animationDelay: "0.4s" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="new-badge">&#9679; new</span>
                <span className="font-mono text-[10px] text-text-muted">released may 15</span>
              </div>
              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-1.5">Frontend update</h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                Whole new look. Faster, darker, less clutter &mdash; same data.
              </p>
            </div>

            <div className="slide-in bg-bg-base border border-border-subtle rounded-lg p-5 hover:border-border-soft hover:translate-x-0.5 transition-all" style={{ animationDelay: "0.6s" }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-[10px] text-text-muted">released apr 8</span>
              </div>
              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-1.5">Posting time heatmap</h3>
              <p className="text-[13px] text-text-secondary leading-relaxed">
                Stop guessing your best posting hour. We mapped every viral reel onto a 7&times;24 grid.
              </p>
            </div>
          </div>

        </div>

      </div>
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
