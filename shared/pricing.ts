import type { PlanType } from "./schema";

// Monthly list price per plan — the single source for every displayed price
// (client/src/lib/plans.ts) and for admin MRR. Display only: the amount a
// customer is actually charged lives on the Paddle price / Razorpay plan, so
// changing a number here must go with a matching price in those dashboards.
// INR prices are GST-inclusive.
//
// Kept out of schema.ts on purpose: the client imports this at runtime, and
// schema.ts would drag drizzle-orm into the browser bundle.
export const planPrices: Record<PlanType, { usd: number; inr: number }> = {
  free: { usd: 0, inr: 0 },
  plus: { usd: 15, inr: 799 },
  pro: { usd: 29, inr: 1499 },
};

export type Currency = "USD" | "INR";

/** "$15" or "₹1,499" */
export function formatPlanPrice(plan: PlanType, currency: Currency): string {
  const { usd, inr } = planPrices[plan];
  return currency === "INR" ? `₹${inr.toLocaleString("en-IN")}` : `$${usd}`;
}
