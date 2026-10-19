import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { loadPaddle, openCheckout } from "@/lib/paddle";
import { openRazorpayCheckout } from "@/lib/razorpay";
import { useCurrency } from "@/lib/locationDetection";
import { PLANS } from "@/lib/plans";
import { errMessage } from "@/lib/apiError";
import { hasLiveSubscription } from "@shared/subscription";
import type { Profile } from "@shared/schema";

const ALREADY_SUBSCRIBED =
  "You already have an active subscription. To change plans, cancel from Billing and subscribe to the new plan.";

/**
 * One entry point for paid checkout. The selected currency picks the
 * provider: INR → Razorpay, USD → Paddle. Refuses a second checkout while a
 * subscription with either provider is live (the server enforces the same
 * rule for Razorpay; Paddle's overlay is client-side, so this is its guard).
 */
export function useCheckout() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [currency] = useCurrency();
  const [paddleReady, setPaddleReady] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: profile } = useQuery<Profile>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (currency !== "USD") return;
    loadPaddle()
      .then(() => setPaddleReady(true))
      .catch((err) => console.error("[Paddle] Load failed:", err));
  }, [currency]);

  const startCheckout = async (planId: "plus" | "pro") => {
    // Unauthenticated → send to register, with ?next=/pricing so they return after signup
    if (!user) {
      window.location.href = "/register?next=/pricing";
      return;
    }

    if (profile && hasLiveSubscription(profile)) {
      toast({ title: "Already subscribed", description: ALREADY_SUBSCRIBED });
      return;
    }

    const plan = PLANS[planId];
    setLoading(true);

    if (currency === "INR") {
      try {
        await openRazorpayCheckout({
          planId,
          planName: plan.name,
          user,
          onDismiss: () => setLoading(false),
          onVerifyFailed: (description) => {
            setLoading(false);
            toast({ title: "Almost there", description });
          },
        });
      } catch (err) {
        setLoading(false);
        toast({ title: "Couldn't start checkout", description: errMessage(err), variant: "destructive" });
      }
      return;
    }

    if (!plan.paddlePriceId) {
      console.error("[Paddle] No price ID configured for plan:", planId);
      setLoading(false);
      return;
    }
    try {
      openCheckout({ priceId: plan.paddlePriceId, userId: user.id, userEmail: user.email ?? "" });
    } catch (err) {
      console.error("[Paddle] Checkout open failed:", err);
      setLoading(false);
      toast({ title: "Couldn't start checkout", description: "Please try again.", variant: "destructive" });
      return;
    }
    // Paddle overlay takes over — reset loading after overlay opens
    setTimeout(() => setLoading(false), 2000);
  };

  // Razorpay's script loads on click, so only Paddle has a "not ready yet" state.
  const ready = !user || currency === "INR" || paddleReady;

  return { startCheckout, loading, ready, currency };
}
