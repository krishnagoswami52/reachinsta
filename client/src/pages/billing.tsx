import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import { ArrowLeft, CreditCard, RefreshCw } from "lucide-react";
import { PLANS } from "@/lib/plans";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Profile } from "@shared/schema";

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "the end of your billing period";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** apiRequest throws "<status>: <json body>" — extract the server's message field. */
function errMessage(error: Error): string {
  const raw = error.message.replace(/^\d+:\s*/, "");
  try {
    return JSON.parse(raw).message ?? raw;
  } catch {
    return raw;
  }
}

export default function BillingPage() {
  useEffect(() => { document.title = "Billing - ReachInsta"; }, []);
  const { toast } = useToast();
  const toastedRef = useRef(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: profile, isLoading } = useQuery<Profile>({
    queryKey: ["/api/profile"],
  });

  const invalidateUserState = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
  };

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/cancel");
      return res.json();
    },
    onSuccess: (data: { cancelAt?: string }) => {
      invalidateUserState();
      setShowCancelConfirm(false);
      toast({
        title: "Subscription canceled",
        description: `You'll keep access until ${formatDate(data.cancelAt)}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't cancel subscription",
        description: errMessage(error),
        variant: "destructive",
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/subscription/resume");
      return res.json();
    },
    onSuccess: () => {
      invalidateUserState();
      toast({
        title: "Subscription resumed",
        description: "Your plan will continue without interruption.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Couldn't resume subscription",
        description: errMessage(error),
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") !== "true" || toastedRef.current) return;

    // Invalidate so sidebar + badge reflect new plan
    queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

    if (profile) {
      toastedRef.current = true;
      const planName = PLANS[profile.plan]?.name ?? profile.plan;
      toast({
        title: `Welcome to ${planName}!`,
        description: "Your subscription is now active.",
      });
    }
  }, [profile, toast]);

  const plan = profile ? PLANS[profile.plan] : null;
  const fetchProgress = profile
    ? Math.min(100, Math.round((profile.fetchesUsed / profile.monthlyFetchLimit) * 100))
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">Manage your subscription and usage</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile && plan ? (
              <>
                <div className="flex items-center gap-3">
                  <PlanBadge plan={profile.plan} />
                  <span className="text-2xl font-bold">
                    ${plan.priceUsd}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </span>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>Up to {plan.competitors} competitors</li>
                  <li>{plan.timeRange}-day analytics window</li>
                  <li>{plan.fetchesPerMonth} fetches / month</li>
                  {plan.csvExport && <li>CSV export included</li>}
                </ul>
                {profile.plan !== "pro" && (
                  <Link href="/pricing" className="block">
                    <Button size="sm" className="w-full">
                      Upgrade Plan
                    </Button>
                  </Link>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading plan details…</p>
            )}
          </CardContent>
        </Card>

        {/* Monthly Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="w-4 h-4" />
              Monthly Usage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile ? (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Fetches used</span>
                    <span className="font-medium">
                      {profile.fetchesUsed} / {profile.monthlyFetchLimit}
                    </span>
                  </div>
                  <Progress value={fetchProgress} className="h-2" />
                </div>
                <div className="text-sm text-muted-foreground">
                  Max competitors: <span className="font-medium text-foreground">{profile.maxCompetitors}</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading usage…</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Cancel / resume subscription */}
      {profile?.subscriptionStatus === "canceling" ? (
        <Card className="border-yellow-500/30">
          <CardContent className="p-6 space-y-4">
            <div>
              <p className="font-medium">Subscription canceled</p>
              <p className="text-sm text-muted-foreground">
                You'll keep your {PLANS[profile.plan]?.name ?? profile.plan} plan until{" "}
                <span className="font-medium text-foreground">{formatDate(profile.cancelAt ?? profile.currentPeriodEnd)}</span>,
                then be downgraded to Free. Changed your mind?
              </p>
            </div>
            <Button
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
            >
              {resumeMutation.isPending ? "Resuming…" : "Resume subscription"}
            </Button>
          </CardContent>
        </Card>
      ) : profile?.paddleSubscriptionId && (profile.subscriptionStatus === "active" || profile.subscriptionStatus === "past_due") ? (
        <Card className="border-destructive/20">
          <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="font-medium">Cancel Subscription</p>
              <p className="text-sm text-muted-foreground">
                Your plan remains active until the end of the billing period.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowCancelConfirm(true)}
              className="border-destructive/40 text-destructive shrink-0"
            >
              Cancel subscription
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll keep access to your current plan until{" "}
              <span className="font-medium text-foreground">{formatDate(profile?.currentPeriodEnd)}</span>.
              After that, you'll be downgraded to the Free plan. You can resume any
              time before then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Keep subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                cancelMutation.mutate();
              }}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending ? "Canceling…" : "Yes, cancel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
