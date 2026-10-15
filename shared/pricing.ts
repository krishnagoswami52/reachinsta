import type { PlanType } from "./schema";

/**
 * Single source of truth for what each plan costs. Every page, the admin MRR
 * mirror and the legal pages read from here, so a price change is one edit.
 *
 * These numbers are what we SHOW. What a customer is actually charged is set by
 * the Paddle price (USD) and the Razorpay plan (INR) the env vars point at, so
 * keep those in step when changing anything here.
 */
export type Currency = "USD" | "INR";

/** Which payment gateway handles which currency. */
export type BillingProvider = "paddle" | "razorpay";

export const PLAN_PRICES: Record<Currency, Record<PlanType, number>> = {
  USD: { free: 0, plus: 19, pro: 49 },
  INR: { free: 0, plus: 399, pro: 999 },
};

export const PROVIDER_FOR_CURRENCY: Record<Currency, BillingProvider> = {
  USD: "paddle",
  INR: "razorpay",
};

/**
 * Currency a subscriber is billed in. Profiles created before Razorpay existed
 * have no billing_provider, and every one of those is a Paddle (USD) customer.
 */
export function currencyForProvider(provider: string | null | undefined): Currency {
  return provider === "razorpay" ? "INR" : "USD";
}

export function formatPrice(amount: number, currency: Currency): string {
  if (currency === "INR") return `₹${amount.toLocaleString("en-IN")}`;
  return `$${amount.toLocaleString("en-US")}`;
}

export function planPrice(plan: PlanType, currency: Currency): string {
  return formatPrice(PLAN_PRICES[currency][plan], currency);
}
