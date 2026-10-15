import { useMemo } from "react";
import type { Currency } from "@shared/pricing";

// Every Indian device reports one of these (Calcutta is the legacy alias).
const INDIA_TIMEZONES = ["Asia/Kolkata", "Asia/Calcutta"];
const OVERRIDE_KEY = "reachinsta.currency";

/**
 * Which currency to show this visitor: INR inside India, USD everywhere else.
 *
 * Detection uses the browser's timezone. Cloudflare only does DNS for
 * reachinsta.com (not the proxy), so no geo-IP header reaches the server, and
 * the timezone is available instantly with no request and no price flicker.
 *
 * `?currency=inr` / `?currency=usd` overrides it for the rest of the tab
 * session, which is handy for testing and for support links.
 */
export function detectCurrency(): Currency {
  try {
    const param = new URLSearchParams(window.location.search).get("currency")?.toUpperCase();
    if (param === "INR" || param === "USD") {
      sessionStorage.setItem(OVERRIDE_KEY, param);
      return param;
    }
    const saved = sessionStorage.getItem(OVERRIDE_KEY);
    if (saved === "INR" || saved === "USD") return saved;
  } catch {
    // sessionStorage can throw in private mode / blocked storage; fall through.
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (INDIA_TIMEZONES.includes(tz)) return "INR";
  } catch {
    // Very old browsers without Intl timezone support: default to USD.
  }
  return "USD";
}

export function useCurrency(): Currency {
  return useMemo(detectCurrency, []);
}
