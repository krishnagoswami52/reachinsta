import type { Currency } from "@shared/pricing";
import { cn } from "@/lib/utils";

interface Props {
  currency: Currency;
  onChange: (currency: Currency) => void;
  className?: string;
}

const OPTIONS: { value: Currency; label: string }[] = [
  { value: "INR", label: "₹ INR" },
  { value: "USD", label: "$ USD" },
];

export function CurrencyToggle({ currency, onChange, className }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Currency"
      className={cn("inline-flex rounded-md border border-border-subtle p-1 font-mono text-[12px]", className)}
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={currency === value}
          onClick={() => onChange(value)}
          data-testid={`currency-${value.toLowerCase()}`}
          className={cn(
            "px-3 py-1.5 rounded transition-colors",
            currency === value
              ? "bg-mint text-bg-base font-semibold"
              : "text-text-muted hover:text-text-primary",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
