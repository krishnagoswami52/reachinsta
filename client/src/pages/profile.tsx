import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { loadPaddle, openCheckout } from "@/lib/paddle";
import { PLANS } from "@/lib/plans";
import { Camera, Crown, CreditCard, Shield, KeyRound, LogOut, ExternalLink } from "lucide-react";
import type { Profile, Competitor } from "@shared/schema";

export default function ProfilePage() {
  useEffect(() => { document.title = "Profile - ReachInsta"; }, []);
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: profile } = useQuery<Profile>({ queryKey: ["/api/profile"] });
  const { data: competitors = [] } = useQuery<Competitor[]>({ queryKey: ["/api/competitors"] });

  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  if (user && !initialized) {
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
    setInitialized(true);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null }) => {
      const res = await apiRequest("PATCH", "/api/auth/user", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setAvatarPreview(null);
      toast({ title: "Profile updated", description: "Your changes have been saved." });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save your changes.", variant: "destructive" });
    },
  });

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 5 MB.", variant: "destructive" });
      return;
    }
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 256;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setAvatarPreview(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = objectUrl;
  }

  function handleSaveProfile() {
    const data: { firstName?: string | null; lastName?: string | null; profileImageUrl?: string | null } = {
      firstName: firstName.trim() || null,
      lastName: lastName.trim() || null,
    };
    if (avatarPreview !== null) data.profileImageUrl = avatarPreview;
    updateMutation.mutate(data);
  }

  function handleRemoveAvatar() {
    setAvatarPreview(null);
    updateMutation.mutate({ profileImageUrl: null });
  }

  const [paddleReady, setPaddleReady] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState(false);

  useEffect(() => {
    loadPaddle()
      .then(() => setPaddleReady(true))
      .catch((err) => console.error("[Paddle] Load failed:", err));
  }, []);

  function handleUpgrade(planId: "plus" | "pro") {
    if (!user) return;
    const plan = PLANS[planId];
    if (!plan.paddlePriceId) return;
    setUpgradeLoading(true);
    try {
      openCheckout({ priceId: plan.paddlePriceId, userId: user.id, userEmail: user.email });
    } catch (err) {
      console.error("[Paddle] Checkout open failed:", err);
      setUpgradeLoading(false);
      return;
    }
    setTimeout(() => setUpgradeLoading(false), 2000);
  }

  const displayAvatar = avatarPreview ?? user?.profileImageUrl ?? undefined;
  const initials = (user?.firstName?.charAt(0) ?? user?.email?.charAt(0) ?? "U").toUpperCase();
  const currentPlan = profile?.plan ?? "free";

  const memberSince = useMemo(() => {
    if (!user?.createdAt) return null;
    try {
      return new Date(user.createdAt as unknown as string).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
      return null;
    }
  }, [user?.createdAt]);

  const nameChanged = firstName !== (user?.firstName ?? "") || lastName !== (user?.lastName ?? "");

  return (
    <div className="max-w-[900px] mx-auto px-6 py-10">

      {/* Page header */}
      <div className="mb-10">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-3">
          // ACCOUNT
        </div>
        <h1 className="font-tight font-bold text-[40px] leading-[1.05] tracking-tightest text-text-primary mb-2">
          Profile &amp; settings.
        </h1>
        <p className="text-[15px] text-text-secondary">
          Manage your account, plan, and how you reach Reels.
        </p>
      </div>

      {/* Account card */}
      <section className="bg-bg-surface border border-border-subtle rounded-lg p-7 mb-6">
        <div className="flex items-start justify-between gap-6 mb-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative group shrink-0">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#2A2D32] to-[#1F2227] flex items-center justify-center text-[22px] font-tight font-semibold border border-border-subtle overflow-hidden">
                {displayAvatar
                  ? <img src={displayAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  : <span>{initials}</span>
                }
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="w-5 h-5 text-white" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </div>

            <div>
              <div className="flex gap-2 mb-1">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  className="font-tight font-semibold text-[20px] tracking-tighter-2 text-text-primary bg-transparent border-b border-transparent hover:border-border-subtle focus:border-mint outline-none w-[110px] transition-colors"
                />
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  className="font-tight font-semibold text-[20px] tracking-tighter-2 text-text-primary bg-transparent border-b border-transparent hover:border-border-subtle focus:border-mint outline-none w-[110px] transition-colors"
                />
              </div>
              <p className="font-mono text-[13px] text-text-secondary">{user?.email}</p>
            </div>
          </div>

          {/* Plan badge + save */}
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded bg-mint-dim text-mint border border-mint/30">
              // {currentPlan}
            </div>
            {(nameChanged || avatarPreview) && (
              <button
                onClick={handleSaveProfile}
                disabled={updateMutation.isPending}
                className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[13px] px-4 py-1.5 rounded-md transition-all disabled:opacity-50"
              >
                {updateMutation.isPending ? "Saving..." : "Save changes"}
              </button>
            )}
            {displayAvatar && (
              <button
                onClick={handleRemoveAvatar}
                disabled={updateMutation.isPending}
                className="font-mono text-[11px] text-text-muted hover:text-danger transition-colors"
              >
                Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Account stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-border-subtle">
          {memberSince && (
            <div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">// MEMBER SINCE</div>
              <div className="font-mono text-[14px] text-text-primary">{memberSince}</div>
            </div>
          )}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">// FETCHES THIS MONTH</div>
            <div className="font-mono text-[14px] text-text-primary">
              {profile?.fetchesUsed ?? 0}<span className="text-text-muted">/{profile?.monthlyFetchLimit ?? 1}</span>
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-1.5">// COMPETITORS TRACKED</div>
            <div className="font-mono text-[14px] text-text-primary">
              {competitors.length}<span className="text-text-muted">/{profile?.maxCompetitors ?? 5}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Plan management */}
      <section className="bg-bg-surface border border-border-subtle rounded-lg p-7 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="w-4 h-4 text-mint" />
          <h2 className="font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">Your plan</h2>
        </div>
        <p className="text-[14px] text-text-secondary mb-6">
          {currentPlan === "free" && "You're on the free plan. Upgrade for more competitors and fetches."}
          {currentPlan === "plus" && "You're on the Plus plan. Need more? Upgrade to Pro for agency-level limits."}
          {currentPlan === "pro" && "You're on the Pro plan. Full access. Thanks for being a power user."}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {(["free", "plus", "pro"] as const).map((plan) => (
            <div key={plan} className={`border rounded-md p-4 transition-colors ${currentPlan === plan ? "border-mint bg-mint-dim" : "border-border-subtle bg-bg-base"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">// {plan}</span>
                {currentPlan === plan && <span className="font-mono text-[10px] text-mint">current</span>}
              </div>
              <div className="font-mono text-[24px] font-semibold text-text-primary mb-3">
                {plan === "free" ? "$0" : plan === "plus" ? "$49" : "$99"}<span className="text-[12px] text-text-muted">/mo</span>
              </div>
              <ul className="space-y-1 font-mono text-[11px] text-text-secondary">
                {plan === "free" && <><li>5 competitors</li><li>1 fetch / month</li><li>7-day window</li></>}
                {plan === "plus" && <><li>50 competitors</li><li>2 fetches / month</li><li>28-day window</li></>}
                {plan === "pro" && <><li>100 competitors</li><li>4 fetches / month</li><li>+ CSV export</li></>}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          {currentPlan !== "pro" && (
            <button
              onClick={() => handleUpgrade(currentPlan === "free" ? "plus" : "pro")}
              disabled={upgradeLoading || !paddleReady}
              className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-2.5 rounded-md inline-flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <Crown className="w-4 h-4" />
              {upgradeLoading ? "Opening checkout..." : currentPlan === "free" ? "Upgrade to Plus" : "Upgrade to Pro"}
            </button>
          )}
          {currentPlan !== "free" && (
            <button
              onClick={() => setLocation("/account/billing")}
              className="border border-border-subtle hover:border-mint text-text-primary hover:text-mint text-[14px] px-5 py-2.5 rounded-md transition-colors inline-flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              Manage billing
            </button>
          )}
        </div>

        {currentPlan === "free" && (
          <p className="font-mono text-[11px] text-text-muted mt-5 italic">
            PS: Annual billing? Email{" "}
            <a href="mailto:kk@reachinsta.com" className="text-mint hover:underline">kk@reachinsta.com</a>
            {" "}&mdash; we&apos;ll knock 20% off.
          </p>
        )}
      </section>

      {/* Security */}
      <section className="bg-bg-surface border border-border-subtle rounded-lg p-7 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-mint" />
          <h2 className="font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">Security</h2>
        </div>
        <p className="text-[14px] text-text-secondary mb-5">
          Change your password or update how we reach you.
        </p>
        <button
          onClick={() => setLocation("/forgot-password")}
          className="w-full flex items-center justify-between p-4 bg-bg-base border border-border-subtle hover:border-border-soft rounded-md transition-colors group"
        >
          <div className="flex items-center gap-3">
            <KeyRound className="w-4 h-4 text-text-secondary group-hover:text-mint transition-colors" />
            <div className="text-left">
              <div className="text-[14px] text-text-primary">Change password</div>
              <div className="font-mono text-[11px] text-text-muted">Sends a reset code to your email</div>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
        </button>
      </section>

      {/* Sign out */}
      <section className="bg-bg-surface border border-border-subtle rounded-lg p-7">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-tight font-semibold text-[16px] tracking-tighter-2 text-text-primary mb-1">Sign out</h2>
            <p className="font-mono text-[12px] text-text-muted">You&apos;ll need to sign in again to access your dashboard.</p>
          </div>
          <button
            onClick={() => logout()}
            className="border border-border-subtle hover:border-danger hover:text-danger text-text-primary text-[14px] px-5 py-2.5 rounded-md transition-colors inline-flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </section>

      <p className="font-mono text-[11px] text-text-muted italic mt-8 text-center">
        PS: Want to delete your account? Email{" "}
        <a href="mailto:kk@reachinsta.com" className="text-mint hover:underline">kk@reachinsta.com</a>
        {" "}&mdash; we&apos;ll wipe everything within 24 hours.
      </p>
    </div>
  );
}
