import { useState, useEffect } from "react";
import { Send, Mail } from "lucide-react";

export default function ContactPage() {
  useEffect(() => { document.title = "Contact — ReachInsta"; }, []);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const mailto = `mailto:krishna@reachinsta.co?subject=${encodeURIComponent(subject || "Hello from ReachInsta")}&body=${encodeURIComponent(`From: ${name} (${email})\n\n${message}`)}`;
      window.location.href = mailto;
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Try emailing krishna@reachinsta.co directly.");
    } finally {
      setSubmitting(false);
    }
  };

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

      {/* CONTACT CONTENT */}
      <section className="py-20 px-6">
        <div className="max-w-[1100px] mx-auto">

          <div className="mb-14 max-w-[600px]">
            <div className="font-mono text-[11px] uppercase tracking-wider text-mint mb-5">
              // CONTACT
            </div>
            <h1 className="font-tight font-bold text-[44px] lg:text-[56px] leading-[1.05] tracking-tightest mb-5">
              Drop a line.
            </h1>
            <p className="text-[17px] text-text-secondary leading-relaxed">
              Bug report? Feature request? Just want to say hi? All emails reach a real human. Usually within 12 hours.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12">

            {/* Contact form */}
            <div className="bg-bg-surface border border-border-subtle rounded-lg p-7 lg:p-8">
              {!submitted ? (
                <form onSubmit={handleSubmit} className="space-y-5">

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2 block">
                        // YOUR NAME
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-transparent border border-border-subtle rounded-md px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-mint focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
                        placeholder="Krishna"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2 block">
                        // EMAIL
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-transparent border border-border-subtle rounded-md px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-mint focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all"
                        placeholder="you@yourdomain.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2 block">
                      // SUBJECT
                    </label>
                    <select
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full bg-bg-base border border-border-subtle rounded-md px-3.5 py-2.5 text-[14px] text-text-primary focus:border-mint focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all appearance-none"
                      style={{ backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='%238B9199'><path d='M4 6 L8 10 L12 6'/></svg>")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", backgroundSize: "14px" }}
                    >
                      <option value="">Pick a reason…</option>
                      <option value="Bug report">Bug report</option>
                      <option value="Feature request">Feature request</option>
                      <option value="Billing question">Billing question</option>
                      <option value="Partnership">Partnership / brand deal</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-mono text-[11px] uppercase tracking-wider text-text-secondary mb-2 block">
                      // MESSAGE
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full bg-transparent border border-border-subtle rounded-md px-3.5 py-2.5 text-[14px] text-text-primary placeholder:text-text-muted focus:border-mint focus:outline-none focus:shadow-[0_0_0_3px_rgba(124,255,178,0.1)] transition-all resize-y min-h-[140px]"
                      placeholder="What's on your mind?"
                    />
                  </div>

                  {error && (
                    <p className="font-mono text-[12px] text-danger">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-mint hover:bg-mint-hover disabled:bg-border-soft disabled:text-text-muted text-bg-base font-semibold text-[14px] px-5 py-3 rounded-md inline-flex items-center gap-2 transition-all"
                  >
                    {submitting ? "Sending…" : "Send message"}
                    <Send className="w-4 h-4" />
                  </button>

                  <p className="font-mono text-[11px] text-text-muted">
                    This will open your email app with the message pre-filled. Direct email also works:{" "}
                    <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a>
                  </p>
                </form>
              ) : (
                <div className="text-center py-10">
                  <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-mint-dim border border-mint/30 mb-5">
                    <Send className="w-6 h-6 text-mint" />
                  </div>
                  <h2 className="font-tight font-bold text-[24px] tracking-tightest mb-3">
                    Your mail client is open.
                  </h2>
                  <p className="text-[14px] text-text-secondary mb-6 max-w-[360px] mx-auto">
                    Hit send from there and I&apos;ll reply within 12 hours. If your mail client didn&apos;t open, just email{" "}
                    <a href="mailto:krishna@reachinsta.co" className="text-mint hover:underline">krishna@reachinsta.co</a> directly.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="font-mono text-[12px] text-text-muted hover:text-text-primary transition-colors"
                  >
                    ← Send another
                  </button>
                </div>
              )}
            </div>

            {/* Right column: contact info */}
            <div className="space-y-6">

              <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
                <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">
                  // DIRECT EMAIL
                </div>
                <div className="flex items-start gap-3 mb-2">
                  <Mail className="w-4 h-4 text-mint mt-0.5 shrink-0" />
                  <div>
                    <a href="mailto:krishna@reachinsta.co" className="font-mono text-[14px] text-text-primary hover:text-mint transition-colors">
                      krishna@reachinsta.co
                    </a>
                    <p className="font-mono text-[11px] text-text-muted mt-1">
                      replies within 12 hours
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-bg-surface border border-border-subtle rounded-lg p-6">
                <div className="font-mono text-[11px] uppercase tracking-wider text-text-muted mb-4">
                  // WHAT TO EXPECT
                </div>
                <ul className="space-y-3 text-[13px] text-text-secondary">
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-1">●</span>
                    <span>Bug reports get fixed first — they hurt everyone.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-1">●</span>
                    <span>Feature requests go into the public roadmap if multiple users ask.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-1">●</span>
                    <span>Billing issues get same-day attention.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-mint mt-1">●</span>
                    <span>Cold pitches and partnerships read on weekends.</span>
                  </li>
                </ul>
              </div>

              <p className="font-mono text-[11px] text-text-muted italic">
                PS: One human runs support. So response quality &gt; response speed. Apologies in advance if it takes 24h on weekends.
              </p>
            </div>
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
