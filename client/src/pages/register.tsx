import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function RegisterPage() {
  useEffect(() => { document.title = "Sign up - ReachInsta"; }, []);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const plan = new URLSearchParams(window.location.search).get("plan");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const pwdStrength = useMemo(() => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const pwdHelperText = useMemo(() => {
    if (!password) return "8+ characters. We never email it back to you.";
    if (password.length < 8) return "a bit short — add a few more chars";
    const msgs = ["weak — try mixing cases", "okay — add a number", "good — one symbol away from great", "great. you're set."];
    return msgs[pwdStrength - 1] ?? "8+ characters. We never email it back to you.";
  }, [password, pwdStrength]);

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; firstName?: string; lastName?: string }) => {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Registration failed");
      }
      return response.json();
    },
    onSuccess: (user) => {
      queryClient.clear();
      queryClient.setQueryData(["/api/auth/user"], user);
      toast({ title: "Account created!", description: "Please check your email to verify your account" });
      const next = new URLSearchParams(window.location.search).get("next");
      setLocation(next ? `/verify-email?next=${encodeURIComponent(next)}` : "/verify-email");
    },
    onError: (error: Error) => {
      toast({ title: "Registration failed", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    registerMutation.mutate({ email, password, firstName: firstName || undefined, lastName: lastName || undefined });
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
            {(plan === "plus" || plan === "pro") && (
              <div className="inline-block font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded bg-mint-dim text-mint border border-mint/30 mb-6">
                Signing up for {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </div>
            )}

            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // 30 SECONDS TO YOUR FIRST FETCH
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[56px] leading-[1.05] tracking-tightest mb-5">
              Create your account.
            </h1>
            <p className="text-[16px] text-text-secondary leading-relaxed mb-10 max-w-[420px]">
              No credit card. 1 free fetch on the house. Cancel without writing us a breakup email.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2" htmlFor="firstName">
                    // FIRST NAME
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Krishna"
                    autoComplete="given-name"
                    className="auth-input"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2" htmlFor="lastName">
                    // LAST NAME
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Kumar"
                    autoComplete="family-name"
                    className="auth-input"
                  />
                </div>
              </div>

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

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2" htmlFor="password">
                  // PASSWORD
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    autoComplete="new-password"
                    required
                    className="auth-input pr-16"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors">
                    {showPassword ? "hide" : "show"}
                  </button>
                </div>
                {/* Strength bar */}
                <div className="flex gap-1 mt-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className={`h-[3px] flex-1 rounded-sm transition-colors ${
                      password.length > 0 && i === 1 && password.length < 8 ? "bg-danger" :
                      i <= pwdStrength ? "bg-mint" : "bg-border-subtle"
                    }`} />
                  ))}
                </div>
                <p className={`font-mono text-[11px] mt-2 ${pwdStrength === 4 ? "text-mint" : password.length > 0 && password.length < 8 ? "text-danger" : "text-text-muted"}`}>
                  {pwdHelperText}
                </p>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2" htmlFor="confirmPassword">
                  // CONFIRM PASSWORD
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;"
                    autoComplete="new-password"
                    required
                    className="auth-input pr-16"
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[11px] uppercase tracking-wider text-text-muted hover:text-text-primary transition-colors">
                    {showConfirm ? "hide" : "show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={registerMutation.isPending}
                data-testid="button-submit-register"
                className="w-full bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] py-3.5 rounded-md inline-flex items-center justify-center gap-2 mt-2 transition-all disabled:opacity-60"
              >
                {registerMutation.isPending ? (
                  <><span className="spinner" />Creating account...</>
                ) : (
                  <>Create my account <ArrowIcon /></>
                )}
              </button>

              <p className="text-[12px] text-text-muted leading-relaxed">
                By signing up, you agree to our{" "}
                <a href="/terms" className="text-mint hover:underline">Terms</a> &amp;{" "}
                <a href="/privacy" className="text-mint hover:underline">Privacy</a>.
                {" "}Both readable in under 4 minutes. We checked.
              </p>
            </form>

            <div className="mt-8 pt-6 border-t border-border-subtle">
              <p className="text-[14px] text-text-secondary">
                Already have an account?{" "}
                <a href="/login" className="text-mint hover:underline ml-1 font-medium">Sign in &rarr;</a>
              </p>
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-3">
          <a href="/" className="font-mono text-[12px] text-text-muted hover:text-text-secondary transition-colors inline-flex items-center gap-1">
            &larr; Back to home
          </a>
          <p className="font-mono text-[11px] text-text-muted max-w-[400px] leading-relaxed">
            PS: We don&apos;t store your password &mdash; it&apos;s hashed with bcrypt before it hits our DB. Nerdy but true.
          </p>
        </div>
      </div>

      {/* RIGHT 40% — Mini flow diagram */}
      <div className="bg-bg-surface relative flex flex-col px-6 lg:px-12 py-12 lg:py-16 border-l border-border-subtle min-h-[400px] lg:min-h-screen">

        <div className="flex-1 flex flex-col justify-center max-w-[420px] w-full">

          <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-3">
            // HOW IT WORKS
          </div>
          <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-2">
            Built for creators who post.
          </h3>
          <p className="text-[14px] text-text-secondary mb-10 leading-relaxed">
            Four steps. Two minutes. One ranked feed of your competitors&apos; best Reels.
          </p>

          <div className="space-y-3">

            <div className="flow-node bg-bg-base border border-border-subtle rounded-lg p-4 flex items-center gap-4 relative">
              <div className="w-10 h-10 rounded-md bg-mint-dim border border-mint/30 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <div className="font-tight font-semibold text-[14px] text-text-primary mb-0.5">You drop handles</div>
                <div className="font-mono text-[11px] text-text-muted">paste up to 100 competitors</div>
              </div>
              <div className="absolute left-9 top-full w-px h-3 bg-border-subtle"></div>
            </div>

            <div className="flow-node bg-bg-base border border-border-subtle rounded-lg p-4 flex items-center gap-4 relative">
              <div className="w-10 h-10 rounded-md bg-mint-dim border border-mint/30 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2"/>
                  <rect x="2" y="14" width="20" height="8" rx="2"/>
                  <line x1="6" y1="6" x2="6.01" y2="6"/>
                  <line x1="6" y1="18" x2="6.01" y2="18"/>
                </svg>
              </div>
              <div>
                <div className="font-tight font-semibold text-[14px] text-text-primary mb-0.5">We fetch their Reels</div>
                <div className="font-mono text-[11px] text-text-muted">~2 min for full 28-day pull</div>
              </div>
              <div className="absolute left-9 top-full w-px h-3 bg-border-subtle"></div>
            </div>

            <div className="flow-node bg-bg-base border border-border-subtle rounded-lg p-4 flex items-center gap-4 relative">
              <div className="w-10 h-10 rounded-md bg-mint-dim border border-mint/30 flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                  <rect x="9" y="9" width="6" height="6"/>
                  <line x1="9" y1="2" x2="9" y2="4"/>
                  <line x1="15" y1="2" x2="15" y2="4"/>
                  <line x1="9" y1="20" x2="9" y2="22"/>
                  <line x1="15" y1="20" x2="15" y2="22"/>
                </svg>
              </div>
              <div>
                <div className="font-tight font-semibold text-[14px] text-text-primary mb-0.5">Viral score ranks them</div>
                <div className="font-mono text-[11px] text-text-muted">velocity, not just volume</div>
              </div>
              <div className="absolute left-9 top-full w-px h-3 bg-border-subtle"></div>
            </div>

            <div className="flow-node bg-mint-dim border border-mint rounded-lg p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-mint flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A0B0D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <div>
                <div className="font-tight font-semibold text-[14px] text-mint mb-0.5">You spot the patterns</div>
                <div className="font-mono text-[11px] text-text-secondary">post what&apos;s working, today</div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-border-subtle grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="font-mono text-[18px] font-semibold text-mint">~2m</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">fetch time</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[18px] font-semibold text-mint">100</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">max competitors</div>
            </div>
            <div className="text-center">
              <div className="font-mono text-[18px] font-semibold text-mint">$0</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">to start</div>
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
