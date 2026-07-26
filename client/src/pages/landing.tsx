import { useEffect, useState } from "react";
import { VideoModal } from "@/components/VideoModal";
import { DEMO_VIDEO_ID, DEMO_VIDEO_TITLE, DEMO_VIDEO_DURATION } from "@/config/video";

export default function LandingPage() {
  useEffect(() => { document.title = "ReachInsta — Find viral Reels before your competitors do."; }, []);
  const [isVideoOpen, setIsVideoOpen] = useState(false);

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

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-20 lg:pt-24 lg:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

          {/* Left 7 cols */}
          <div className="lg:col-span-7 relative">
            <div className="flex items-center gap-2 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-mint pulse-dot" />
              <span className="font-mono text-[12px] uppercase tracking-wider text-mint">v2.0 — Now 3x faster</span>
            </div>

            <h1 className="font-tight font-bold text-[40px] sm:text-[56px] lg:text-[72px] leading-[1.05] tracking-tightest">
              Find viral Reels in{" "}
              <span className="text-mint relative inline-block">
                2 minutes.
                <svg className="absolute -bottom-6 -right-4 lg:-right-12" width="120" height="44" viewBox="0 0 120 44" fill="none">
                  <path className="draw-path" d="M2 8C20 4 50 6 80 16 C95 20 105 28 110 36" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  <path className="draw-path" d="M104 30 L110 36 L104 40" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              </span>
            </h1>

            <p className="font-mono text-[11px] text-text-muted mt-10 max-w-[280px] italic">
              *tested on a 50-competitor fetch, decent Wi-Fi
            </p>

            <p className="text-[17px] text-text-secondary leading-relaxed mt-8 max-w-[480px]">
              Stop scrolling through your competitors&apos; feeds for hours. ReachInsta surfaces their top-performing Reels in one fetch &mdash; view counts, posting times, hook patterns, all in a clean dashboard. Built for creators who&apos;d rather post than research.
            </p>

            <div className="flex flex-wrap items-center gap-3 mt-10">
              <a href="/signup" className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[14px] px-5 py-3 rounded-md inline-flex items-center gap-2 transition-all hover:-translate-y-px">
                Start tracking &mdash; it&apos;s free <ArrowIcon />
              </a>
              <button
                onClick={() => setIsVideoOpen(true)}
                className="border border-border-subtle hover:border-mint hover:text-mint text-text-primary font-semibold text-[14px] px-5 py-3 rounded-md inline-flex items-center gap-2 transition-colors"
                aria-label="Watch 90 second product demo video"
              >
                <PlayIcon /> Watch 90s demo
              </button>
            </div>

            <p className="font-mono text-[12px] text-text-muted mt-5">
              No credit card. 1 fetch on the house. Cancel without emailing us.
            </p>
          </div>

          {/* Right 5 cols — Product mock */}
          <div className="lg:col-span-5 relative">
            <div className="glow-bl bg-bg-surface rounded-lg p-5" style={{ transform: "rotate(-2deg)" }}>
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-mint pulse-dot" />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">Top Viral Reels — Last 7d</span>
                </div>
                <span className="font-mono text-[10px] text-text-muted">live</span>
              </div>

              {/* Row 1 */}
              <div className="flex items-center justify-between py-3 hover:bg-bg-elevated rounded-md px-2 -mx-2 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2A2D32] to-[#1F2227] flex items-center justify-center text-[11px] font-semibold">M</div>
                  <div>
                    <div className="font-mono text-[13px] text-text-primary">@minusonefriday</div>
                    <div className="font-mono text-[10px] text-text-muted">2h ago &middot; VS 94</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-[14px] font-medium">2,431,902</div>
                  <svg className="spark" width="40" height="20" viewBox="0 0 40 20" fill="none">
                    <polyline points="0,16 6,14 12,15 18,10 24,8 30,5 38,2" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  </svg>
                  <span className="font-mono text-[10px] text-mint bg-mint-dim px-1.5 py-0.5 rounded">+42%</span>
                </div>
              </div>

              {/* Row 2 */}
              <div className="flex items-center justify-between py-3 hover:bg-bg-elevated rounded-md px-2 -mx-2 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2A2D32] to-[#1F2227] flex items-center justify-center text-[11px] font-semibold">D</div>
                  <div>
                    <div className="font-mono text-[13px] text-text-primary">@danceswithdrones</div>
                    <div className="font-mono text-[10px] text-text-muted">5h ago &middot; VS 81</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-[14px] font-medium">1,847,003</div>
                  <svg className="spark" width="40" height="20" viewBox="0 0 40 20" fill="none">
                    <polyline points="0,12 6,10 12,11 18,9 24,11 30,8 38,9" stroke="#8B9199" strokeWidth="1.5" fill="none"/>
                  </svg>
                  <span className="font-mono text-[10px] text-text-secondary bg-[#1F2227] px-1.5 py-0.5 rounded">+18%</span>
                </div>
              </div>

              {/* Row 3 */}
              <div className="flex items-center justify-between py-3 hover:bg-bg-elevated rounded-md px-2 -mx-2 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2A2D32] to-[#1F2227] flex items-center justify-center text-[11px] font-semibold">L</div>
                  <div>
                    <div className="font-mono text-[13px] text-text-primary">@latenightcoder</div>
                    <div className="font-mono text-[10px] text-text-muted">8h ago &middot; VS 76</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="font-mono text-[14px] font-medium">1,203,556</div>
                  <svg className="spark" width="40" height="20" viewBox="0 0 40 20" fill="none">
                    <polyline points="0,14 6,13 12,12 18,11 24,10 30,8 38,7" stroke="#8B9199" strokeWidth="1.5" fill="none"/>
                  </svg>
                  <span className="font-mono text-[10px] text-text-secondary bg-[#1F2227] px-1.5 py-0.5 rounded">+9%</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between">
                <span className="font-mono text-[10px] text-text-muted">fetched 47 competitors</span>
                <span className="font-mono text-[10px] text-mint">~2m</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* SOCIAL PROOF STRIP */}
      <section className="bg-bg-surface border-y border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6 py-7 flex flex-wrap items-center justify-between gap-4">
          <span className="text-[13px] text-text-muted">Built by creators with</span>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[32px] font-medium text-mint">2.2M+</span>
            <span className="text-[14px] text-text-secondary">combined Instagram followers</span>
          </div>
          <span className="font-mono text-[11px] text-text-muted hidden lg:inline">// not a stock-photo trust badge</span>
        </div>
      </section>

      {/* PRODUCT DEMO VIDEO */}
      <section className="py-14 lg:py-24 border-b border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[40px] lg:text-[48px] leading-[1.1] tracking-tightest mb-3 max-w-[700px]">
            See ReachInsta in 90 seconds.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[480px] mb-14">
            One fetch, one dashboard, zero doomscrolling. Watch the whole flow.
          </p>

          <button
            onClick={() => setIsVideoOpen(true)}
            className="group relative block w-full max-w-[880px] aspect-video rounded-lg overflow-hidden bg-bg-surface border border-border-subtle hover:border-border-soft transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/60"
            aria-label="Play product demo video"
          >
            <img
              src={`https://img.youtube.com/vi/${DEMO_VIDEO_ID}/maxresdefault.jpg`}
              alt="ReachInsta product demo preview"
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                const img = e.currentTarget;
                img.onerror = null;
                img.src = `https://img.youtube.com/vi/${DEMO_VIDEO_ID}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/20 transition-colors" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 lg:w-20 lg:h-20 rounded-full bg-mint group-hover:bg-mint-hover group-hover:scale-110 transition-all duration-300 flex items-center justify-center shadow-2xl">
                <svg width="26" height="26" viewBox="0 0 22 22" fill="none" className="ml-1">
                  <path d="M6 4L18 11L6 18V4Z" fill="#0A0B0D"/>
                </svg>
              </div>
            </div>
            <div className="absolute bottom-4 right-4 px-2.5 py-1 bg-black/70 rounded font-mono text-[11px] text-text-primary" style={{ backdropFilter: "blur(4px)" }}>
              {DEMO_VIDEO_DURATION}
            </div>
          </button>

          <p className="font-mono text-[12px] text-text-muted mt-6">
            No signup required to watch. Sound optional, results not.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="py-14 lg:py-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[40px] lg:text-[48px] leading-[1.1] tracking-tightest mb-3 max-w-[700px]">
            From zero to viral intel in three steps.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[480px]">
            We do the boring scraping. You do the posting.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-14">
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 relative hover:border-border-soft transition-colors">
              <div className="font-mono text-[28px] text-mint font-medium mb-8">01</div>
              <h3 className="font-tight font-semibold text-[22px] tracking-tighter-2 mb-3">Drop in competitors</h3>
              <p className="text-[15px] text-text-secondary leading-relaxed">
                Paste up to 100 Instagram handles. Yes, even the ones you stalk in incognito.
              </p>
              <svg className="absolute bottom-6 right-6 opacity-30" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 relative hover:border-border-soft transition-colors">
              <div className="font-mono text-[28px] text-mint font-medium mb-8">02</div>
              <h3 className="font-tight font-semibold text-[22px] tracking-tighter-2 mb-3">We fetch the data</h3>
              <p className="text-[15px] text-text-secondary leading-relaxed">
                Our scraper pulls last 28 days of Reels &mdash; views, likes, comments, timestamps, captions. ~2 minutes end-to-end.
              </p>
              <svg className="absolute bottom-6 right-6 opacity-30" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/>
                <line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>
              </svg>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 relative hover:border-border-soft transition-colors">
              <div className="font-mono text-[28px] text-mint font-medium mb-8">03</div>
              <h3 className="font-tight font-semibold text-[22px] tracking-tighter-2 mb-3">You spot the patterns</h3>
              <p className="text-[15px] text-text-secondary leading-relaxed">
                Filter by viral score, sort by posting hour, export to CSV. Find the format before it saturates.
              </p>
              <svg className="absolute bottom-6 right-6 opacity-30" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="py-14 lg:py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[40px] lg:text-[48px] leading-[1.1] tracking-tightest mb-14 max-w-[680px]">
            Built like a tool, not a dashboard.
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Wide — Viral Score */}
            <div className="lg:col-span-2 bg-bg-surface border border-border-subtle rounded-lg p-8 hover:border-border-soft transition-colors">
              <div className="flex items-start justify-between gap-6 flex-wrap">
                <div className="flex-1 min-w-[240px]">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-3">// signature feature</div>
                  <h3 className="font-tight font-semibold text-[26px] tracking-tighter-2 mb-3">Viral Score</h3>
                  <p className="text-[15px] text-text-secondary leading-relaxed max-w-[420px]">
                    We weight velocity over volume. A reel doing 100K in 6 hours scores higher than 500K in a week.
                  </p>
                </div>
                {/* Mini bar chart */}
                <div className="flex items-end gap-2 h-[110px] mt-2">
                  {[
                    { h: "30%", delay: "0s", mint: false },
                    { h: "48%", delay: "0.08s", mint: false },
                    { h: "38%", delay: "0.16s", mint: false },
                    { h: "100%", delay: "0.24s", mint: true },
                    { h: "60%", delay: "0.32s", mint: false },
                    { h: "42%", delay: "0.4s", mint: false },
                    { h: "28%", delay: "0.48s", mint: false },
                  ].map(({ h, delay, mint }, i) => (
                    <div key={i} className={`w-5 rounded-sm bar-rise ${mint ? "bg-mint" : "bg-[#2A2D32]"}`} style={{ height: h, animationDelay: delay }} />
                  ))}
                </div>
              </div>
            </div>

            {/* 28-day */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 hover:border-border-soft transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-5">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <h3 className="font-tight font-semibold text-[20px] tracking-tighter-2 mb-2">28-day window</h3>
              <p className="text-[14px] text-text-secondary leading-relaxed">Track the trend, not just the snapshot.</p>
            </div>

            {/* Heatmap */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 hover:border-border-soft transition-colors">
              <div className="grid grid-cols-7 gap-0.5 w-fit mb-5">
                {[
                  "bg-[#1F2227]","bg-[#2A2D32]","bg-[#3A3D42]",
                  "opacity-30","opacity-50","bg-mint","opacity-60",
                  "bg-[#2A2D32]","bg-[#3A3D42]","opacity-40",
                  "opacity-70","bg-mint","opacity-50","bg-[#3A3D42]",
                ].map((cls, i) => (
                  <div key={i} className={`w-2 h-2 rounded-sm ${cls.startsWith("opacity") ? `bg-mint ${cls}` : cls}`} />
                ))}
              </div>
              <h3 className="font-tight font-semibold text-[20px] tracking-tighter-2 mb-2">Posting time heatmap</h3>
              <p className="text-[14px] text-text-secondary leading-relaxed">See which hours actually work for your niche.</p>
            </div>

            {/* CSV */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 hover:border-border-soft transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              <h3 className="font-tight font-semibold text-[20px] tracking-tighter-2 mb-2">CSV export</h3>
              <p className="text-[14px] text-text-secondary leading-relaxed">Take your data and run. We won&apos;t hold it hostage.</p>
            </div>

          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="py-14 lg:py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[40px] lg:text-[48px] leading-[1.1] tracking-tightest mb-3 max-w-[700px]">
            Pricing that respects your time.
          </h2>
          <p className="text-[17px] text-text-secondary max-w-[520px] mb-14">
            Start free. Upgrade when you need more competitors. That&apos;s it.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* FREE */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 hover:border-border-soft transition-colors flex flex-col">
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-2">// free</div>
              <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-2">Free</h3>
              <p className="text-[13px] text-text-secondary mb-7">For getting started</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-tight font-bold text-[48px] tracking-tightest">$0</span>
                <span className="font-mono text-[13px] text-text-muted">/month</span>
              </div>
              <ul className="space-y-3 text-[14px] mb-8 flex-1">
                <PricingFeature>5 competitors</PricingFeature>
                <PricingFeature>7-day time range</PricingFeature>
                <PricingFeature>1 fetch / month</PricingFeature>
                <PricingFeatureMissing>No CSV export</PricingFeatureMissing>
              </ul>
              <a href="/signup" className="border border-border-subtle hover:border-mint hover:text-mint text-center font-semibold text-[14px] py-3 rounded-md transition-colors">Start Free</a>
            </div>

            {/* PLUS — highlighted */}
            <div className="bg-bg-surface border-2 border-mint rounded-lg p-8 flex flex-col relative" style={{ boxShadow: "0 0 60px -20px rgba(124, 255, 178, 0.25)" }}>
              <div className="absolute -top-3 left-8">
                <span className="font-mono text-[10px] uppercase tracking-wider bg-mint text-bg-base px-2.5 py-1 rounded font-semibold">Most picked</span>
              </div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-2">// plus</div>
              <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-2">Plus</h3>
              <p className="text-[13px] text-text-secondary mb-7">For growing creators</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-tight font-bold text-[48px] tracking-tightest">$49</span>
                <span className="font-mono text-[13px] text-text-muted">/month</span>
              </div>
              <ul className="space-y-3 text-[14px] mb-8 flex-1">
                <PricingFeature>50 competitors</PricingFeature>
                <PricingFeature>28-day time range</PricingFeature>
                <PricingFeature>2 fetches / month</PricingFeature>
                <PricingFeatureMissing>No CSV export</PricingFeatureMissing>
              </ul>
              <a href="/signup?plan=plus" className="bg-mint hover:bg-mint-hover text-bg-base text-center font-semibold text-[14px] py-3 rounded-md transition-all hover:-translate-y-px">Upgrade to Plus</a>
            </div>

            {/* PRO */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 hover:border-border-soft transition-colors flex flex-col">
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-2">// pro</div>
              <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-2">Pro</h3>
              <p className="text-[13px] text-text-secondary mb-7">For agencies</p>
              <div className="flex items-baseline gap-1 mb-8">
                <span className="font-tight font-bold text-[48px] tracking-tightest">$99</span>
                <span className="font-mono text-[13px] text-text-muted">/month</span>
              </div>
              <ul className="space-y-3 text-[14px] mb-8 flex-1">
                <PricingFeature>100 competitors</PricingFeature>
                <PricingFeature>28-day time range</PricingFeature>
                <PricingFeature>4 fetches / month</PricingFeature>
                <PricingFeature>CSV export</PricingFeature>
              </ul>
              <a href="/signup?plan=pro" className="border border-border-subtle hover:border-mint hover:text-mint text-center font-semibold text-[14px] py-3 rounded-md transition-colors">Upgrade to Pro</a>
            </div>
          </div>

          <p className="font-mono text-[12px] text-text-muted mt-10 max-w-[600px]">
            Annual billing? Email{" "}
            <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>{" "}
            &mdash; we&apos;ll knock 20% off.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-14 lg:py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4">
              <div className="w-20 h-px bg-mint mb-6" />
              <h2 className="font-tight font-bold text-[40px] leading-[1.1] tracking-tightest mb-4">
                Questions, asked honestly.
              </h2>
              <p className="text-[15px] text-text-secondary max-w-[280px]">
                Still curious?{" "}
                <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">Email me</a>{" "}
                directly.
              </p>
            </div>

            <div className="lg:col-span-8 space-y-2">
              <details className="border-b border-border-subtle py-5 group" open>
                <summary className="flex items-center justify-between gap-4">
                  <span className="faq-q font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">Is this against Instagram&apos;s TOS?</span>
                  <span className="faq-chev font-mono text-[20px] text-text-muted">+</span>
                </summary>
                <p className="text-[15px] text-text-secondary leading-relaxed mt-4 max-w-[640px]">
                  We only access public Reels &mdash; same data you&apos;d get manually. No login required, no DMs, no private accounts. We don&apos;t store your IG password because we never ask for it.
                </p>
              </details>

              <details className="border-b border-border-subtle py-5 group">
                <summary className="flex items-center justify-between gap-4">
                  <span className="faq-q font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">How fresh is the data?</span>
                  <span className="faq-chev font-mono text-[20px] text-text-muted">+</span>
                </summary>
                <p className="text-[15px] text-text-secondary leading-relaxed mt-4 max-w-[640px]">
                  Each fetch is real-time. We don&apos;t cache. Trade-off: you get limited fetches per month based on plan. We&apos;d rather show you fresh truth than stale charts.
                </p>
              </details>

              <details className="border-b border-border-subtle py-5 group">
                <summary className="flex items-center justify-between gap-4">
                  <span className="faq-q font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">Can I cancel anytime?</span>
                  <span className="faq-chev font-mono text-[20px] text-text-muted">+</span>
                </summary>
                <p className="text-[15px] text-text-secondary leading-relaxed mt-4 max-w-[640px]">
                  Yes. One click in settings. No email, no exit survey, no guilt trip.
                </p>
              </details>

              <details className="border-b border-border-subtle py-5 group">
                <summary className="flex items-center justify-between gap-4">
                  <span className="faq-q font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">Do you support TikTok or YouTube Shorts?</span>
                  <span className="faq-chev font-mono text-[20px] text-text-muted">+</span>
                </summary>
                <p className="text-[15px] text-text-secondary leading-relaxed mt-4 max-w-[640px]">
                  Not yet. We&apos;re staying focused on Reels until we&apos;re the best at it. Probably Q3 2026. If you want to vote on the roadmap, the link&apos;s in the footer.
                </p>
              </details>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-16 lg:py-28 border-t border-border-subtle relative overflow-hidden">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[32px] sm:text-[44px] lg:text-[64px] leading-[1.05] tracking-tightest max-w-[820px] mb-6">
            Your competitors aren&apos;t reading this. They&apos;re{" "}
            <span className="text-mint">posting.</span>
          </h2>
          <p className="text-[18px] text-text-secondary max-w-[480px] mb-10">
            Get the same intel they don&apos;t have &mdash; for free.
          </p>
          <a href="/signup" className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[15px] px-6 py-3.5 rounded-md inline-flex items-center gap-2 transition-all hover:-translate-y-px">
            Start tracking &mdash; free forever plan <ArrowIcon />
          </a>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border-subtle py-10 lg:py-16">
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

      <VideoModal
        isOpen={isVideoOpen}
        onClose={() => setIsVideoOpen(false)}
        videoId={DEMO_VIDEO_ID}
        title={DEMO_VIDEO_TITLE}
      />

    </div>
  );
}

function PricingFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 7l3 3 5-6" stroke="#7CFFB2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span className="text-text-primary">{children}</span>
    </li>
  );
}

function PricingFeatureMissing({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M3 3l8 8M11 3l-8 8" stroke="#5A6069" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
      <span className="text-text-muted">{children}</span>
    </li>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2.5 1.5L10.5 6L2.5 10.5V1.5Z" fill="currentColor"/>
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
