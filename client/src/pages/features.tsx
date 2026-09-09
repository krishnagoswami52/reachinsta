import { useEffect } from "react";

const heatmapData: [string, number[]][] = [
  ["MON", [0, 0, 0, 1, 1, 2, 2, 1, 2, 3, 2, 1]],
  ["TUE", [0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 3, 2]],
  ["WED", [0, 0, 0, 1, 2, 2, 2, 2, 3, 3, 2, 1]],
  ["THU", [0, 0, 0, 1, 1, 2, 2, 3, 3, 3, 2, 1]],
  ["FRI", [0, 0, 1, 1, 2, 2, 3, 2, 2, 2, 2, 1]],
  ["SAT", [0, 0, 1, 2, 2, 2, 2, 1, 1, 2, 2, 1]],
  ["SUN", [0, 0, 1, 1, 2, 2, 2, 2, 2, 2, 2, 1]],
];
const colorMap = ["#1F2227", "#2A2D32", "rgba(124,255,178,0.3)", "rgba(124,255,178,0.6)", "#7CFFB2"];

export default function FeaturesPage() {
  useEffect(() => { document.title = "Features — ReachInsta"; }, []);

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
            <a href="/features" className="text-text-primary transition-colors">Features</a>
          </div>
          <div className="flex items-center gap-3">
            <a href="/login" className="text-[14px] text-text-secondary hover:text-text-primary px-3 py-2 transition-colors">Log In</a>
            <a href="/signup" className="bg-mint hover:bg-mint-hover text-bg-base text-[14px] font-semibold px-4 py-2 rounded-md transition-all hover:-translate-y-px">Start Free</a>
          </div>
        </div>
      </nav>

      {/* PAGE HEADER */}
      <section className="pt-20 pb-12">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">// FEATURES</div>
          <h1 className="font-tight font-bold text-[48px] lg:text-[64px] leading-[1.05] tracking-tightest max-w-[900px] mb-6">
            Here&apos;s exactly what happens when you hit{" "}
            <span className="text-mint">&apos;Fetch&apos;</span>.
          </h1>
          <p className="text-[18px] text-text-secondary leading-relaxed max-w-[620px]">
            No vague feature promises. We&apos;ll walk you through the actual data flow &mdash; competitor in, viral intel out, in under 10 seconds.
          </p>
        </div>
      </section>

      {/* FLOW DIAGRAM */}
      <section className="pb-24">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-10 lg:p-14">
            <div className="relative">
              <svg viewBox="0 0 1000 200" className="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                {/* Connecting lines */}
                <line x1="200" y1="100" x2="320" y2="100" stroke="#2A2D32" strokeWidth="1.5" strokeDasharray="4 4" className="dash-line"/>
                <line x1="480" y1="100" x2="600" y2="100" stroke="#2A2D32" strokeWidth="1.5" strokeDasharray="4 4" className="dash-line" style={{ animationDelay: "0.3s" }}/>
                <line x1="760" y1="100" x2="880" y2="100" stroke="#2A2D32" strokeWidth="1.5" strokeDasharray="4 4" className="dash-line" style={{ animationDelay: "0.6s" }}/>

                {/* Travelling dots */}
                <circle r="3" fill="#7CFFB2">
                  <animateMotion dur="2.4s" repeatCount="indefinite" path="M200,100 L320,100"/>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" repeatCount="indefinite"/>
                </circle>
                <circle r="3" fill="#7CFFB2">
                  <animateMotion dur="2.4s" begin="0.6s" repeatCount="indefinite" path="M480,100 L600,100"/>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" begin="0.6s" repeatCount="indefinite"/>
                </circle>
                <circle r="3" fill="#7CFFB2">
                  <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M760,100 L880,100"/>
                  <animate attributeName="opacity" values="0;1;1;0" dur="2.4s" begin="1.2s" repeatCount="indefinite"/>
                </circle>

                {/* Node 1: YOU */}
                <g transform="translate(40, 50)">
                  <rect width="160" height="100" rx="10" fill="#0A0B0D" stroke="#1F2227" strokeWidth="1.5"/>
                  <circle cx="20" cy="20" r="3" fill="#7CFFB2">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/>
                  </circle>
                  <circle cx="80" cy="42" r="14" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <path d="M68 60 Q80 50 92 60" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <text x="80" y="84" textAnchor="middle" fontFamily="Inter Tight" fontWeight="700" fontSize="14" fill="#E8EAED" letterSpacing="-0.3">YOU</text>
                </g>

                {/* Node 2: SCRAPER */}
                <g transform="translate(320, 50)">
                  <rect width="160" height="100" rx="10" fill="#0A0B0D" stroke="#1F2227" strokeWidth="1.5"/>
                  <circle cx="20" cy="20" r="3" fill="#7CFFB2">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.4s" repeatCount="indefinite"/>
                  </circle>
                  <rect x="62" y="28" width="36" height="10" rx="2" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <rect x="62" y="42" width="36" height="10" rx="2" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <circle cx="68" cy="33" r="1.2" fill="#7CFFB2"/>
                  <circle cx="68" cy="47" r="1.2" fill="#7CFFB2"/>
                  <text x="80" y="84" textAnchor="middle" fontFamily="Inter Tight" fontWeight="700" fontSize="13" fill="#E8EAED" letterSpacing="-0.3">SCRAPER</text>
                </g>

                {/* Node 3: VS ENGINE */}
                <g transform="translate(600, 50)">
                  <rect width="160" height="100" rx="10" fill="#0A0B0D" stroke="#1F2227" strokeWidth="1.5"/>
                  <circle cx="20" cy="20" r="3" fill="#7CFFB2">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="0.8s" repeatCount="indefinite"/>
                  </circle>
                  <rect x="66" y="30" width="28" height="28" rx="2" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <line x1="60" y1="38" x2="66" y2="38" stroke="#7CFFB2" strokeWidth="1.5"/>
                  <line x1="60" y1="50" x2="66" y2="50" stroke="#7CFFB2" strokeWidth="1.5"/>
                  <line x1="94" y1="38" x2="100" y2="38" stroke="#7CFFB2" strokeWidth="1.5"/>
                  <line x1="94" y1="50" x2="100" y2="50" stroke="#7CFFB2" strokeWidth="1.5"/>
                  <rect x="72" y="36" width="16" height="16" fill="#7CFFB2" opacity="0.3"/>
                  <text x="80" y="84" textAnchor="middle" fontFamily="Inter Tight" fontWeight="700" fontSize="11" fill="#E8EAED" letterSpacing="-0.3">VS ENGINE</text>
                </g>

                {/* Node 4: DASHBOARD */}
                <g transform="translate(880, 50)">
                  <rect width="80" height="100" rx="10" fill="#0A0B0D" stroke="#7CFFB2" strokeWidth="1.5"/>
                  <circle cx="14" cy="20" r="3" fill="#7CFFB2">
                    <animate attributeName="opacity" values="1;0.4;1" dur="2s" begin="1.2s" repeatCount="indefinite"/>
                  </circle>
                  <rect x="22" y="30" width="36" height="28" rx="2" stroke="#7CFFB2" strokeWidth="1.5" fill="none"/>
                  <line x1="22" y1="38" x2="58" y2="38" stroke="#7CFFB2" strokeWidth="1.2"/>
                  <line x1="22" y1="46" x2="58" y2="46" stroke="#7CFFB2" strokeWidth="1.2"/>
                  <text x="40" y="78" textAnchor="middle" fontFamily="Inter Tight" fontWeight="700" fontSize="9" fill="#7CFFB2" letterSpacing="-0.3">YOU</text>
                </g>
              </svg>

              <div className="grid grid-cols-4 gap-6 mt-6 text-center">
                {[
                  { step: "step 01", desc: "Paste competitor handles" },
                  { step: "step 02", desc: "We fetch the last 28 days of Reels" },
                  { step: "step 03", desc: "Algorithm weighs velocity + engagement" },
                  { step: "step 04", desc: "Ranked Reels, ready in ~2m", highlight: true },
                ].map(({ step, desc, highlight }) => (
                  <div key={step}>
                    <div className={`font-mono text-[10px] uppercase tracking-wider mb-1 ${highlight ? "text-mint" : "text-text-muted"}`}>{step}</div>
                    <p className="text-[12px] text-text-secondary leading-snug max-w-[160px] mx-auto">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 pt-8 border-t border-border-subtle">
              <p className="font-mono text-[12px] text-text-muted">
                Average end-to-end fetch time: <span className="text-mint">2 minutes</span> for 50 competitors. Tested daily.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION A: Competitor Tracking */}
      <section className="py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// 01 &mdash; tracking</div>
              <h2 className="font-tight font-bold text-[36px] lg:text-[42px] leading-[1.1] tracking-tightest mb-5 max-w-[440px]">
                Track up to 100 competitors. Re-fetch when you want.
              </h2>
              <p className="text-[16px] text-text-secondary leading-relaxed max-w-[480px] mb-8">
                Add Instagram handles in bulk (paste a list, one per line). We validate them, check they&apos;re public, and queue them up. Re-fetch on demand &mdash; we don&apos;t auto-refresh because we respect your fetch quota.
              </p>
              <ul className="space-y-2.5 font-mono text-[13px] text-text-secondary">
                <li className="flex items-center gap-2"><span className="text-mint">&#9679;</span> Up to <span className="text-mint">100</span> handles</li>
                <li className="flex items-center gap-2"><span className="text-mint">&#9679;</span> Bulk paste supported</li>
                <li className="flex items-center gap-2"><span className="text-mint">&#9679;</span> Auto-validation</li>
              </ul>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-mint pulse-dot" />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-text-secondary">add competitors</span>
                </div>
                <span className="font-mono text-[10px] text-text-muted">3 / 100</span>
              </div>
              <div className="space-y-3">
                {[
                  { handle: "@minusonefriday", followers: "1.2M followers", delay: "0.2s", checkDelay: "0.5s" },
                  { handle: "@danceswithdrones", followers: "847K followers", delay: "0.8s", checkDelay: "1.1s" },
                  { handle: "@latenightcoder", followers: "312K followers", delay: "1.4s", checkDelay: "1.7s" },
                ].map(({ handle, followers, delay, checkDelay }) => (
                  <div key={handle} className="handle-row flex items-center justify-between bg-bg-base border border-border-subtle rounded-md px-3 py-2.5" style={{ animationDelay: delay }}>
                    <span className="font-mono text-[13px] text-text-primary">{handle}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-text-muted">{followers}</span>
                      <svg className="check-pop" width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animationDelay: checkDelay }}>
                        <circle cx="8" cy="8" r="7.5" fill="#7CFFB2" fillOpacity="0.15" stroke="#7CFFB2"/>
                        <path d="M5 8L7 10L11 6" stroke="#7CFFB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                ))}
                <div className="handle-row flex items-center justify-between bg-bg-base border border-dashed border-border-soft rounded-md px-3 py-2.5" style={{ animationDelay: "2s" }}>
                  <span className="font-mono text-[13px] text-text-muted">@<span className="text-text-secondary">typing</span><span className="text-mint">|</span></span>
                  <span className="font-mono text-[10px] text-text-muted italic">validating&hellip;</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION B: Viral Score */}
      <section className="py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Diagram LEFT */}
            <div className="order-2 lg:order-1">
              <div className="bg-bg-surface border border-border-subtle rounded-lg p-7">
                <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-5">// viral score formula</div>
                <div className="relative">
                  <div className="grid grid-cols-2 gap-2.5 mb-12 relative z-10">
                    {[
                      { label: "views / hr", value: "12.8K", delay: "0s" },
                      { label: "eng rate", value: "8.2%", delay: "0.4s" },
                      { label: "cmt ratio", value: "0.94", delay: "0.8s" },
                      { label: "time decay", value: "0.86", delay: "1.2s" },
                    ].map(({ label, value, delay }) => (
                      <div key={label} className="formula-box bg-bg-base border border-border-subtle rounded-md px-3 py-3" style={{ animationDelay: delay }}>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
                        <div className="font-mono text-[15px] text-text-primary font-medium">{value}</div>
                      </div>
                    ))}
                  </div>
                  <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" viewBox="0 0 400 200" preserveAspectRatio="none">
                    <line x1="80" y1="60" x2="200" y2="160" stroke="#2A2D32" strokeWidth="1" strokeDasharray="3 3" className="dash-line"/>
                    <line x1="320" y1="60" x2="200" y2="160" stroke="#2A2D32" strokeWidth="1" strokeDasharray="3 3" className="dash-line" style={{ animationDelay: "0.2s" }}/>
                    <line x1="80" y1="140" x2="200" y2="160" stroke="#2A2D32" strokeWidth="1" strokeDasharray="3 3" className="dash-line" style={{ animationDelay: "0.4s" }}/>
                    <line x1="320" y1="140" x2="200" y2="160" stroke="#2A2D32" strokeWidth="1" strokeDasharray="3 3" className="dash-line" style={{ animationDelay: "0.6s" }}/>
                  </svg>
                  <div className="bg-mint-dim border border-mint rounded-md px-4 py-4 flex items-center justify-between relative z-10" style={{ boxShadow: "0 0 40px -10px rgba(124, 255, 178, 0.3)" }}>
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-mint mb-1">= viral score</div>
                      <div className="font-mono text-[11px] text-text-muted">@minusonefriday &middot; 2h ago</div>
                    </div>
                    <div className="font-tight font-bold text-[36px] text-mint tracking-tightest">94<span className="font-mono text-[14px] text-text-muted font-normal">/100</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Text RIGHT */}
            <div className="order-1 lg:order-2">
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// 02 &mdash; viral score</div>
              <h2 className="font-tight font-bold text-[36px] lg:text-[42px] leading-[1.1] tracking-tightest mb-5 max-w-[440px]">
                Our viral score weighs <span className="text-mint">velocity</span>, not just volume.
              </h2>
              <p className="text-[16px] text-text-secondary leading-relaxed max-w-[480px]">
                A Reel doing 100K views in 6 hours is more replicable than one doing 500K in 2 weeks. Our algorithm factors in views/hour, engagement rate, comment-to-view ratio, and time since posted.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Squiggle divider */}
      <div className="max-w-[1200px] mx-auto px-6 py-4">
        <svg className="w-full max-w-[200px] h-4 mx-auto" viewBox="0 0 200 16" fill="none">
          <path d="M2 8 Q12 2 22 8 T42 8 T62 8 T82 8 T102 8 T122 8 T142 8 T162 8 T182 8 T198 8" stroke="#7CFFB2" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.6"/>
        </svg>
      </div>

      {/* SECTION C: Heatmap */}
      <section className="py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// 03 &mdash; heatmap</div>
              <h2 className="font-tight font-bold text-[36px] lg:text-[42px] leading-[1.1] tracking-tightest mb-5 max-w-[440px]">
                Stop guessing the best posting time.
              </h2>
              <p className="text-[16px] text-text-secondary leading-relaxed max-w-[480px]">
                We map every viral reel from your tracked competitors onto a 7-day &times; 24-hour grid. You see exactly when your niche&apos;s audience is hungry. Hint: it&apos;s almost never 9 AM.
              </p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7">
              <div className="flex items-center justify-between mb-5">
                <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted">when tech creators post viral reels</div>
                <span className="font-mono text-[10px] text-text-muted">last 28d</span>
              </div>
              <div className="space-y-1">
                {heatmapData.map(([day, values]) => (
                  <div key={day} className="flex items-center gap-1">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-text-muted w-8 shrink-0">{day}</span>
                    {values.map((v, i) => (
                      <div
                        key={i}
                        className="rounded-sm flex-1 transition-transform hover:scale-125"
                        style={{
                          height: "14px",
                          background: colorMap[v],
                          ...(day === "TUE" && i === 9 ? { outline: "1.5px solid #7CFFB2", outlineOffset: "1px" } : {}),
                        }}
                      />
                    ))}
                  </div>
                ))}
                <div className="flex items-center gap-1 mt-1">
                  <span className="w-8 shrink-0" />
                  {["0", "4", "8", "12", "16", "20"].map((h) => (
                    <span key={h} className="font-mono text-[9px] text-text-muted flex-1 text-left">{h}</span>
                  ))}
                </div>
              </div>
              <div className="mt-5 pt-5 border-t border-border-subtle flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-3 h-3 bg-mint rounded-sm" />
                  <span className="font-mono text-[11px] text-text-secondary">Tuesday <span className="text-mint">9 PM</span> &mdash; peak for tech creators</span>
                </div>
                <span className="font-mono text-[10px] text-text-muted">&rarr; post here</span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">less</span>
                {["#1F2227", "#2A2D32", "rgba(124,255,178,0.3)", "rgba(124,255,178,0.6)", "#7CFFB2"].map((bg, i) => (
                  <div key={i} className="w-3 h-3 rounded-sm" style={{ background: bg }} />
                ))}
                <span className="font-mono text-[9px] text-text-muted uppercase tracking-wider">more</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION D: Export */}
      <section className="py-24 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">// 04 &mdash; export</div>
              <h2 className="font-tight font-bold text-[36px] lg:text-[42px] leading-[1.1] tracking-tightest mb-5 max-w-[440px]">
                Your data, your spreadsheet.
              </h2>
              <p className="text-[16px] text-text-secondary leading-relaxed max-w-[480px]">
                One-click CSV export of any view. Take it to Notion, Excel, Airtable &mdash; wherever. We don&apos;t lock data inside our dashboard because we&apos;re not jerks.
              </p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-12 bg-bg-base border border-border-subtle rounded relative flex items-end justify-center pb-1">
                    <div className="absolute top-0 right-0 w-3 h-3 bg-bg-surface border-l border-b border-border-subtle" />
                    <span className="font-mono text-[9px] text-mint font-medium">CSV</span>
                  </div>
                  <div>
                    <div className="font-mono text-[13px] text-text-primary">reels_export.csv</div>
                    <div className="font-mono text-[10px] text-text-muted">2,431 rows &middot; 47KB</div>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-mint">downloading&hellip;</span>
              </div>
              <div className="w-full h-1 bg-bg-base rounded-full overflow-hidden mb-2">
                <div className="progress-fill h-full bg-mint" />
              </div>
              <div className="flex items-center justify-between font-mono text-[10px] text-text-muted">
                <span>87%</span><span>~0.3s remaining</span>
              </div>
              <div className="mt-6 pt-6 border-t border-border-subtle">
                <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted mb-3">// takes it to</div>
                <div className="flex flex-wrap gap-2">
                  {["Notion", "Excel", "Airtable", "Sheets", "wherever"].map((dest) => (
                    <span key={dest} className="chip">{dest}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON STRIP */}
      <section className="py-20 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="bg-bg-surface border border-border-subtle rounded-lg p-8 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-12 items-center">
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-3">// the old way</div>
                <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4 text-text-secondary">Manual research</h3>
                <ul className="space-y-2 font-mono text-[13px] text-text-muted">
                  <li>2-3 hours per session</li>
                  <li>5-10 competitors max</li>
                  <li>no scoring</li>
                  <li>no export</li>
                </ul>
              </div>
              <div className="flex lg:flex-col items-center gap-3">
                <div className="h-px lg:w-px lg:h-20 w-12 bg-border-subtle" />
                <span className="font-mono text-[12px] uppercase tracking-wider text-text-muted">vs</span>
                <div className="h-px lg:w-px lg:h-20 w-12 bg-border-subtle" />
              </div>
              <div>
                <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-3">// the new way</div>
                <h3 className="font-tight font-semibold text-[24px] tracking-tighter-2 mb-4">With ReachInsta</h3>
                <ul className="space-y-2 font-mono text-[13px] text-mint">
                  <li>~2 minutes</li>
                  <li>up to 100 competitors</li>
                  <li>ranked by viral score</li>
                  <li>exportable</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-28 border-t border-border-subtle">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="w-20 h-px bg-mint mb-6" />
          <h2 className="font-tight font-bold text-[44px] lg:text-[60px] leading-[1.05] tracking-tightest max-w-[760px] mb-6">
            Try it on <span className="text-mint">5 competitors.</span> Free, forever.
          </h2>
          <p className="text-[18px] text-text-secondary max-w-[440px] mb-10">
            No credit card. No 14-day trial countdown. Just real intel.
          </p>
          <a href="/signup" className="bg-mint hover:bg-mint-hover text-bg-base font-semibold text-[15px] px-6 py-3.5 rounded-md inline-flex items-center gap-2 transition-all hover:-translate-y-px">
            Start tracking
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7H11M11 7L7 3M11 7L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
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
