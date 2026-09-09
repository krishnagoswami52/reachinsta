import { useEffect } from "react";

export default function RefundPage() {
  useEffect(() => { document.title = "Refund Policy — ReachInsta"; }, []);

  return (
    <div className="min-h-screen bg-bg-base text-text-primary">

      {/* NAV */}
      <nav className="sticky top-0 z-50 bg-bg-base/70 border-b border-border-subtle" style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" stroke="#7CFFB2"/>
              <path d="M8 6L16 11L8 16V6Z" fill="#7CFFB2"/>
            </svg>
            <span className="font-tight font-semibold text-[18px] tracking-tighter-2">ReachInsta</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-[14px] text-text-secondary">
            <a href="/features" className="hover:text-text-primary transition-colors">Features</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-[14px] text-text-secondary hover:text-text-primary px-3 py-2 transition-colors">Log In</a>
            <a href="/signup" className="bg-mint hover:bg-mint-hover text-bg-base text-[14px] font-semibold px-4 py-2 rounded-md transition-all hover:-translate-y-px">Start Free</a>
          </div>
        </div>
      </nav>

      {/* REFUND CONTENT */}
      <section className="py-20 px-6">
        <div className="max-w-[760px] mx-auto">

          <div className="mb-14">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // REFUND POLICY
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[52px] leading-[1.05] tracking-tightest mb-5">
              Refund policy.
            </h1>
            <p className="text-[16px] text-text-secondary leading-relaxed mb-3">
              Last updated <span className="font-mono text-text-primary">September 9, 2026</span>.
            </p>
            <p className="font-mono text-[12px] text-text-muted italic">
              14 days, no questions asked. Email{" "}
              <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>{" "}
              and we handle the rest.
            </p>
          </div>

          {/* TL;DR */}
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 mb-12">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-3">
              // TL;DR
            </div>
            <ul className="space-y-2 text-[14px] text-text-secondary">
              <li>● Full refund within 14 days of any payment. No questions asked.</li>
              <li>● Applies to every paid plan — Plus and Pro, monthly or annual.</li>
              <li>● Email us with your payment reference. Approved within 48 hours.</li>
              <li>● Money lands back on your original payment method in 5&ndash;10 business days.</li>
              <li>● Cancel anytime from your billing page. Cancelling is separate from refunding.</li>
            </ul>
          </div>

          <div className="prose-content space-y-10">

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">1. 14-day money-back guarantee</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                If you request a refund within <strong className="text-text-primary">14 days</strong> of a payment to ReachInsta, we refund that payment in full. You don&apos;t need to give a reason, and we won&apos;t ask you for one.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                The 14 days run from the date the payment was taken. This applies to your first payment and to every renewal payment after it — each charge carries its own 14-day window. How much of the service you used during those 14 days doesn&apos;t change the amount you get back.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">2. How to request a refund</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Email{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>{" "}
                from the address on your ReachInsta account, with:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● The subject line &ldquo;Refund request&rdquo;</li>
                <li>● Your account email</li>
                <li>● Your payment reference or invoice number (it&apos;s on the receipt emailed to you)</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4 mb-3">
                You can also reach us through the{" "}
                <a href="/contact" className="text-mint hover:underline">contact form</a>. Either route works.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                We approve refund requests within 48 hours of receiving them. Once approved, the refund is issued through our payment provider, which acts as the merchant of record for your purchase. Funds typically appear on your original payment method within 5&ndash;10 business days, depending on your bank or card issuer.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">3. What&apos;s covered</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                The 14-day guarantee covers every paid ReachInsta subscription:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● <strong className="text-text-primary">Plus</strong> ($49/mo) — monthly and annual billing</li>
                <li>● <strong className="text-text-primary">Pro</strong> ($99/mo) — monthly and annual billing</li>
                <li>● Any upgrade, downgrade, or plan-change charge</li>
                <li>● Renewal charges, each with their own 14-day window</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                The Free plan costs nothing, so there&apos;s nothing to refund on it.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">4. After 14 days</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Once 14 days have passed since a payment, that payment falls outside the guarantee. Subscriptions are billed for the period ahead, so a charge older than 14 days covers time you&apos;ve already had access to.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                You can still write to us. If something went wrong on our side — a failed fetch, extended downtime, a billing error — email{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>{" "}
                and we&apos;ll make it right, whether that means a credit or a refund.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">5. Cancellations</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Cancelling and refunding are two different things. Cancelling stops future charges; a refund returns money already paid.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                You can cancel at any time from{" "}
                <a href="/account/billing" className="text-mint hover:underline">Account &rarr; Billing</a>. There&apos;s no cancellation fee and no notice period. Your paid features stay active until the end of the period you&apos;ve already paid for, then your account drops to the Free plan. Your saved competitors and history stay in your account.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Cancelling doesn&apos;t automatically refund your most recent payment. If that payment was made in the last 14 days and you want it back, email us — the guarantee in section 1 still applies.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">6. Changes to this policy</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                If we update this policy, the version in force is the one published on the date of your payment. We&apos;ll email active users at least 14 days before any material change takes effect, and the &ldquo;last updated&rdquo; date at the top of this page always reflects the current version.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">7. Contact</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Refund requests, billing questions, anything money-related:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Email:{" "}
                  <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>
                </li>
                <li>● Contact form:{" "}
                  <a href="/contact" className="text-mint hover:underline">reachinsta.co/contact</a>
                </li>
                <li>● Response time: within 48 hours, usually much sooner</li>
              </ul>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-border-subtle">
            <p className="font-mono text-[12px] text-text-muted italic">
              Read alongside our <a href="/terms" className="text-mint hover:underline">Terms of Service</a> and{" "}
              <a href="/privacy" className="text-mint hover:underline">Privacy Policy</a>.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border-subtle py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
            <div>
              <a href="/" className="flex items-center gap-2 mb-4">
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" stroke="#7CFFB2"/>
                  <path d="M8 6L16 11L8 16V6Z" fill="#7CFFB2"/>
                </svg>
                <span className="font-tight font-semibold text-[18px] tracking-tighter-2">ReachInsta</span>
              </a>
              <p className="text-[13px] text-text-secondary italic max-w-[260px] leading-relaxed">
                Reels intelligence for creators who post more than they scroll.
              </p>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// product</div>
              <ul className="space-y-2.5 text-[14px]">
                <li><a href="/features" className="text-text-secondary hover:text-text-primary transition-colors">Features</a></li>
                <li><a href="/#pricing" className="text-text-secondary hover:text-text-primary transition-colors">Pricing</a></li>
                <li><span className="text-text-muted cursor-not-allowed select-none flex items-center gap-1">API <span className="font-mono text-[10px] text-text-muted">(soon)</span></span></li>
              </ul>
            </div>
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// company</div>
              <ul className="space-y-2.5 text-[14px]">
                <li><a href="/contact" className="text-text-secondary hover:text-text-primary transition-colors">Contact</a></li>
                <li><a href="/privacy" className="text-text-secondary hover:text-text-primary transition-colors">Privacy</a></li>
                <li><a href="/terms" className="text-text-secondary hover:text-text-primary transition-colors">Terms</a></li>
                <li><a href="/refund" className="text-text-secondary hover:text-text-primary transition-colors">Refund Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border-subtle pt-8">
            <p className="font-mono text-[12px] text-text-muted">
              &copy; 2026 ReachInsta. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
