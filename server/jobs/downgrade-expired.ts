import { and, eq, lte } from "drizzle-orm";
import { db } from "../db";
import { profiles } from "@shared/schema";
import { storage } from "../storage";

/**
 * Downgrades users whose canceled subscriptions have reached their period end.
 * Neither Paddle nor Razorpay reliably delivers a webhook at the exact moment
 * access should lapse, so this runs daily as the enforcement backstop. Idempotent: once
 * downgraded, the user no longer matches the "canceling" filter.
 */
export async function downgradeExpiredSubscriptions(): Promise<number> {
  const now = new Date();

  const expired = await db
    .select()
    .from(profiles)
    .where(
      and(
        eq(profiles.subscriptionStatus, "canceling"),
        lte(profiles.cancelAt, now),
      ),
    );

  if (expired.length === 0) {
    console.log("[Cron] No expired subscriptions to downgrade");
    return 0;
  }

  console.log(`[Cron] Downgrading ${expired.length} expired subscription(s)`);

  for (const user of expired) {
    // updateProfileSubscription also resets the derived plan-limit columns
    await storage.updateProfileSubscription(user.id, {
      plan: "free",
      subscriptionStatus: "canceled",
      paddleSubscriptionId: null,
      razorpaySubscriptionId: null,
      paymentProvider: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      currentPeriodEnd: null,
    });
    console.log(`[Cron] Downgraded user ${user.id} (${user.email}) to free`);
  }

  return expired.length;
}
