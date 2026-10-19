import type { Currency } from "@shared/pricing";
import { cn } from "@/lib/utils";

interface Props {
  currency: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
}

/**
 * Low-key escape hatch under the pricing cards. Each visitor sees only the
 * currency detected for them (Razorpay can't take international cards, so
 * non-Indian visitors shouldn't be steered to INR), but an Indian user
 * abroad — or anyone detected wrongly — can still switch, and the choice is
 * saved.
 */
export function CurrencySwitchLink({ currency, onChange, className }: Props) {
  const target: Currency = currency === "INR" ? "USD" : "INR";

  return (
    <p className={cn("text-center text-[13px] text-text-muted", className)}>
      {currency === "INR" ? "🌍 Not in India?" : "🇮🇳 From India?"}{" "}
      <button
        type="button"
        onClick={() => onChange(target)}
        data-testid={`currency-switch-${target.toLowerCase()}`}
        // py padding gives a ~44px tap target on phones without changing the look
        className="text-mint underline underline-offset-2 hover:text-mint-hover py-3 -my-3"
      >
        View {target} prices
      </button>
    </p>
  );
}
