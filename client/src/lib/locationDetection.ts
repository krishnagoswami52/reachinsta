import { useEffect, useState } from "react";
import type { Currency } from "@shared/pricing";

const STORAGE_KEY = "user-currency";
const CHANGE_EVENT = "user-currency-change";
const INDIA_TIMEZONES = ["Asia/Kolkata", "Asia/Calcutta"];

function readStored(): Currency | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "INR" || v === "USD" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(currency: Currency) {
  try {
    localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // Private mode / blocked storage: the choice still applies for this page view.
  }
}

/**
 * Which currency to show prices in. An explicit choice always beats detection:
 *   1. ?currency=inr|usd in the URL (also saved, so it sticks across pages)
 *   2. the choice saved from the toggle
 *   3. an Indian browser timezone → INR
 *   4. USD
 * This only picks the display/checkout currency; anyone can switch with the toggle.
 */
export function getUserCurrency(): Currency {
  if (typeof window === "undefined") return "USD";

  const param = new URLSearchParams(window.location.search).get("currency")?.toUpperCase();
  if (param === "INR" || param === "USD") {
    writeStored(param);
    return param;
  }

  const stored = readStored();
  if (stored) return stored;

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (INDIA_TIMEZONES.includes(tz)) return "INR";
  } catch {
    // Intl unavailable — fall through to USD.
  }

  return "USD";
}

export function setUserCurrencyPreference(currency: Currency) {
  writeStored(currency);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: currency }));
}

/** Current currency, kept in sync across every component that uses it. */
export function useCurrency(): [Currency, (c: Currency) => void] {
  const [currency, setCurrency] = useState<Currency>(getUserCurrency);

  useEffect(() => {
    const onChange = (e: Event) => setCurrency((e as CustomEvent<Currency>).detail);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  return [currency, setUserCurrencyPreference];
}
