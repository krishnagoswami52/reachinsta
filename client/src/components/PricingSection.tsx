import { PLANS } from "@/lib/plans";
import { UpgradeButton } from "@/components/UpgradeButton";
import { CurrencyToggle } from "@/components/CurrencyToggle";
import { useCurrency } from "@/lib/locationDetection";
import { formatPlanPrice } from "@shared/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Profile } from "@shared/schema";

interface Props {
  profile?: Profile | null;
  showHeader?: boolean;
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-primary shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4 shrink-0 text-muted-foreground" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

const pricingPlans = [
  {
    plan: PLANS.free,
    description: "For getting started",
    highlighted: false,
    features: [
      { text: `${PLANS.free.competitors} competitors`, included: true },
      { text: `${PLANS.free.timeRange}-day time range`, included: true },
      { text: `${PLANS.free.fetchesPerMonth} fetch per month`, included: true },
      { text: "CSV export", included: false },
    ],
  },
  {
    plan: PLANS.plus,
    description: "For growing creators",
    highlighted: true,
    features: [
      { text: `${PLANS.plus.competitors} competitors`, included: true },
      { text: `${PLANS.plus.timeRange}-day time range`, included: true },
      { text: `${PLANS.plus.fetchesPerMonth} fetches per month`, included: true },
      { text: "CSV export", included: false },
    ],
  },
  {
    plan: PLANS.pro,
    description: "For agencies",
    highlighted: false,
    features: [
      { text: `${PLANS.pro.competitors} competitors`, included: true },
      { text: `${PLANS.pro.timeRange}-day time range`, included: true },
      { text: `${PLANS.pro.fetchesPerMonth} fetches per month`, included: true },
      { text: "CSV export", included: true },
    ],
  },
];

export function PricingSection({ profile, showHeader = true }: Props) {
  const currentPlan = profile?.plan;
  const [currency, setCurrency] = useCurrency();

  return (
    <div>
      {showHeader && (
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Simple, Transparent Pricing</h2>
          <p className="text-lg text-muted-foreground">Start free, upgrade as you grow. No hidden fees.</p>
        </div>
      )}

      <div className="flex justify-center mb-8">
        <CurrencyToggle currency={currency} onChange={setCurrency} />
      </div>

      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {pricingPlans.map(({ plan, description, highlighted, features }) => (
          <Card key={plan.id} className={`relative ${highlighted ? "border-primary" : ""}`}>
            {highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                Most Popular
              </div>
            )}
            <CardContent className="p-8 space-y-6">
              <div>
                <h3 className="text-xl font-semibold">{plan.name}</h3>
                <p className="text-muted-foreground text-sm mt-1">{description}</p>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-bold">{formatPlanPrice(plan.id, currency)}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-3 text-sm">
                {features.map(({ text, included }) => (
                  <li key={text} className={`flex items-center gap-2 ${included ? "" : "text-muted-foreground"}`}>
                    {included ? <CheckIcon /> : <XIcon />}
                    {included ? text : `No ${text.toLowerCase()}`}
                  </li>
                ))}
              </ul>

              {plan.id === "free" ? (
                currentPlan === "free" ? (
                  <Button disabled variant="outline" className="w-full">
                    Current Plan
                  </Button>
                ) : (
                  <a href="/register" className="block">
                    <Button variant="outline" className="w-full">
                      Get Started Free
                    </Button>
                  </a>
                )
              ) : (
                <UpgradeButton
                  planId={plan.id as "plus" | "pro"}
                  currentPlan={currentPlan}
                  variant={highlighted ? "default" : "outline"}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
