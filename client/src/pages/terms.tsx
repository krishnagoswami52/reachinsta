import { useEffect } from "react";
import { PLANS } from "@/lib/plans";

export default function TermsPage() {
  useEffect(() => { document.title = "Terms of Service — ReachInsta"; }, []);

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

      {/* TERMS CONTENT */}
      <section className="py-20 px-6">
        <div className="max-w-[760px] mx-auto">

          <div className="mb-14">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // TERMS OF SERVICE
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[52px] leading-[1.05] tracking-tightest mb-5">
              Terms of service.
            </h1>
            <p className="text-[16px] text-text-secondary leading-relaxed mb-3">
              In plain English. Last updated <span className="font-mono text-text-primary">May 19, 2026</span>.
            </p>
            <p className="font-mono text-[12px] text-text-muted italic">
              We tried to keep this readable. If anything&apos;s unclear, email{" "}
              <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>.
            </p>
          </div>

          {/* TL;DR */}
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 mb-12">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-3">
              // TL;DR
            </div>
            <ul className="space-y-2 text-[14px] text-text-secondary">
              <li>● Use ReachInsta to analyze publicly available Instagram Reels data.</li>
              <li>● Don&apos;t use it to harass, scrape private accounts, or do illegal stuff.</li>
              <li>● We can suspend you for abuse.</li>
              <li>● Cancel anytime. Refunds available within 14 days of payment, no questions asked.</li>
              <li>● Your data stays yours. We don&apos;t sell it.</li>
            </ul>
          </div>

          <div className="prose-content space-y-10">

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">1. What ReachInsta is</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                ReachInsta (the &ldquo;Service&rdquo;) is an analytics platform that helps Instagram creators and agencies discover viral Reels patterns from publicly available accounts. We access only public data — same data anyone can see by scrolling Instagram. No login to Instagram is required from you.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">2. Your account</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                You&apos;re responsible for keeping your login credentials safe. You must be at least 16 years old to use ReachInsta. One person per account — don&apos;t share logins with your team. (Need team access? Email us and we&apos;ll figure out an agency plan.)
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                If you suspect unauthorized access, reset your password immediately at{" "}
                <a href="/forgot-password" className="text-mint hover:underline">/forgot-password</a> and email us.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">3. Acceptable use</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">You agree NOT to:</p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Use ReachInsta to harass, dox, or stalk individuals</li>
                <li>● Attempt to access private or restricted Instagram accounts</li>
                <li>● Reverse-engineer, decompile, or attempt to extract our viral score algorithm</li>
                <li>● Resell or redistribute ReachInsta data to third parties without our written permission</li>
                <li>● Use automated bots, scrapers, or scripts against the ReachInsta dashboard itself</li>
                <li>● Violate Instagram&apos;s own Terms of Service while using our analytics</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                Violation may result in immediate account suspension. Our{" "}
                <a href="/refund" className="text-mint hover:underline">14-day refund guarantee</a>{" "}
                applies either way.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">4. Plans, billing, and refunds</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Pricing is shown on the homepage. We currently offer Free (${PLANS.free.priceUsd}), Plus (${PLANS.plus.priceUsd}/mo, or ₹{PLANS.plus.priceInr.toLocaleString("en-IN")}/mo in INR), and Pro (${PLANS.pro.priceUsd}/mo, or ₹{PLANS.pro.priceInr.toLocaleString("en-IN")}/mo in INR) tiers. USD payments are processed by Paddle, which acts as the merchant of record for your purchase. INR payments are processed by Razorpay; for those, ReachInsta is the seller.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                <strong className="text-text-primary">Refunds:</strong> We offer a 14-day full refund window from your payment date, no questions asked. Email{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>{" "}
                with your payment reference and we&apos;ll process it within 48 hours. Full details in our{" "}
                <a href="/refund" className="text-mint hover:underline">Refund Policy</a>.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                <strong className="text-text-primary">Cancellation:</strong> Cancel anytime from{" "}
                <a href="/account/billing" className="text-mint hover:underline">Account &rarr; Billing</a>. Your access continues until the end of the paid period. No partial refunds for unused time after the 14-day window.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">5. Data and Instagram&apos;s TOS</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                ReachInsta accesses only publicly available Instagram Reels metadata: view counts, like counts, comment counts, post timestamps, captions, and creator handles. We do not access:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Private accounts</li>
                <li>● Direct messages</li>
                <li>● Stories or story interactions</li>
                <li>● User-level personal information beyond public profile</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                We do not store Instagram user passwords or session tokens — we don&apos;t ask for them.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">6. Service availability</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                We aim for 99% uptime but don&apos;t guarantee it. ReachInsta is provided &ldquo;as is.&rdquo; If our service is down for more than 48 consecutive hours during your paid period, email us and we&apos;ll credit your account.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">7. Intellectual property</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                The ReachInsta brand, dashboard, viral score algorithm, and codebase are owned by ReachInsta. You don&apos;t get rights to redistribute or replicate them. Data you export (CSVs, analytics) is yours to use however you want, including commercially.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">8. Limitation of liability</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Our maximum liability to you is capped at the amount you paid us in the preceding 12 months. We&apos;re not liable for indirect damages, lost profits, or business interruptions resulting from use or downtime of ReachInsta.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">9. Changes to these terms</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                We may update these terms occasionally. Material changes will be emailed to active users at least 14 days before they take effect. Continued use after the effective date constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">10. Contact</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Questions, concerns, legal stuff:{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-border-subtle">
            <p className="font-mono text-[12px] text-text-muted italic">
              These terms are governed by the laws of India. Disputes go through Udaipur jurisdiction.
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
