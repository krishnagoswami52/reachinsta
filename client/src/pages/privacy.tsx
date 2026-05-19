import { useEffect } from "react";

export default function PrivacyPage() {
  useEffect(() => { document.title = "Privacy Policy — ReachInsta"; }, []);

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

      {/* PRIVACY CONTENT */}
      <section className="py-20 px-6">
        <div className="max-w-[760px] mx-auto">

          <div className="mb-14">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // PRIVACY POLICY
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[52px] leading-[1.05] tracking-tightest mb-5">
              Your data, our rules.
            </h1>
            <p className="text-[16px] text-text-secondary leading-relaxed mb-3">
              Last updated <span className="font-mono text-text-primary">May 19, 2026</span>.
            </p>
            <p className="font-mono text-[12px] text-text-muted italic">
              No dark patterns. No selling data. No &ldquo;we may share with affiliates&rdquo; nonsense.
            </p>
          </div>

          {/* TL;DR */}
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-6 mb-12">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-3">
              // TL;DR
            </div>
            <ul className="space-y-2 text-[14px] text-text-secondary">
              <li>● We collect email, name, hashed password, and your billing details (via Paddle).</li>
              <li>● We track which Instagram handles you&apos;ve added — that&apos;s it for personal data.</li>
              <li>● We don&apos;t sell, share, or rent your data to anyone, ever.</li>
              <li>● We use cookies for auth sessions. No tracking cookies, no ad pixels.</li>
              <li>● You can delete everything by emailing us. We respond within 24 hours.</li>
            </ul>
          </div>

          <div className="space-y-10">

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">1. What we collect</h2>

              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-2 mt-5 text-text-primary">From you, directly:</h3>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5 mb-4">
                <li>● First name and last name (sign-up)</li>
                <li>● Email address (sign-up + login)</li>
                <li>● Password (stored as bcrypt hash — we never see plaintext)</li>
                <li>● Avatar image (optional, profile page)</li>
                <li>● Payment details (billing name, last 4 digits of card — handled by Paddle, we never see full card numbers)</li>
              </ul>

              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-2 mt-5 text-text-primary">Automatically:</h3>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5 mb-4">
                <li>● Login timestamps (for security)</li>
                <li>● Which Instagram handles you&apos;ve added to track</li>
                <li>● Which fetches you&apos;ve run and when</li>
                <li>● Basic browser info (browser type, OS) — for debugging only</li>
              </ul>

              <h3 className="font-tight font-semibold text-[16px] tracking-tighter-2 mb-2 mt-5 text-text-primary">What we DON&apos;T collect:</h3>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Your Instagram password (we never ask)</li>
                <li>● Your IP address (beyond standard server logs)</li>
                <li>● Browsing behavior outside ReachInsta</li>
                <li>● Phone number, address, age</li>
                <li>● Anything for advertising — we don&apos;t run ads</li>
              </ul>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">2. How we use it</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                Your data is used to:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Authenticate you and keep your dashboard secure</li>
                <li>● Process payments (via Paddle)</li>
                <li>● Run the Instagram fetches you initiate</li>
                <li>● Send you transactional emails (password reset, payment receipts, important account updates)</li>
                <li>● Improve the product (aggregated, anonymized usage patterns only)</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                We do NOT send marketing emails without your explicit opt-in.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">3. Who we share it with</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                We share data only with these service providers, strictly to operate ReachInsta:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● <strong className="text-text-primary">Supabase</strong> — our database and auth provider</li>
                <li>● <strong className="text-text-primary">Paddle</strong> — payment processing (handles billing data)</li>
                <li>● <strong className="text-text-primary">Apify</strong> — runs the Instagram public data fetches you initiate</li>
                <li>● <strong className="text-text-primary">Hostinger</strong> — our hosting provider</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                We do NOT sell, rent, lease, or share your data with anyone else. Period.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">4. Cookies</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                We use only essential cookies — the ones required to keep you logged in. No tracking cookies, no third-party analytics scripts, no ad pixels.
              </p>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Specifically: <span className="font-mono text-text-primary">sb-access-token</span> and{" "}
                <span className="font-mono text-text-primary">sb-refresh-token</span> (Supabase auth session cookies).
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">5. Data retention</h2>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● <strong className="text-text-primary">Active accounts:</strong> retained as long as your account exists</li>
                <li>● <strong className="text-text-primary">Deleted accounts:</strong> all personal data wiped within 24 hours of deletion request</li>
                <li>● <strong className="text-text-primary">Billing records:</strong> Paddle retains these for 7 years per Indian tax law (we cannot delete these from their side)</li>
                <li>● <strong className="text-text-primary">Server logs:</strong> auto-deleted after 30 days</li>
              </ul>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">6. Your rights</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                You have the right to:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Access — request a copy of all data we hold about you</li>
                <li>● Correct — fix anything wrong (most fields editable in profile)</li>
                <li>● Delete — wipe your account and all associated data</li>
                <li>● Export — download your competitor list and fetch history as CSV</li>
                <li>● Object — opt out of any future marketing emails (zero by default)</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                To exercise any of these rights, email{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>. We respond within 24 hours.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">7. Security</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7] mb-3">
                We take security seriously. Specifically:
              </p>
              <ul className="space-y-2 text-[15px] text-text-secondary leading-[1.7] pl-5">
                <li>● Passwords stored as bcrypt hashes (never plaintext)</li>
                <li>● Row-Level Security (RLS) enabled on all database tables</li>
                <li>● HTTPS-only across the entire app</li>
                <li>● Supabase auth handles session tokens with industry-standard JWT</li>
                <li>● Regular security audits (manual + automated)</li>
              </ul>
              <p className="text-[15px] text-text-secondary leading-[1.7] mt-4">
                That said, no system is 100% secure. If a breach occurs, we&apos;ll notify affected users within 72 hours.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">8. Children&apos;s privacy</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                ReachInsta is not intended for users under 16. We do not knowingly collect data from minors. If we discover an account belongs to someone under 16, we delete it.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">9. International users</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Our servers are hosted in India. By using ReachInsta from outside India, you consent to your data being transferred to and processed in India. We do our best to comply with GDPR principles globally even though we&apos;re not EU-based.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">10. Changes to this policy</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                We&apos;ll email active users at least 14 days before any material changes. The &ldquo;last updated&rdquo; date at the top of this page always reflects the current version.
              </p>
            </section>

            <section>
              <h2 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">11. Contact</h2>
              <p className="text-[15px] text-text-secondary leading-[1.7]">
                Privacy questions, data requests, or just want to verify what we have on you:{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>
              </p>
            </section>
          </div>

          <div className="mt-16 pt-8 border-t border-border-subtle">
            <p className="font-mono text-[12px] text-text-muted italic">
              Built with privacy by default. Always.
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
