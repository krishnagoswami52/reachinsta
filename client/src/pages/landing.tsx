import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { BarChart3, Users, TrendingUp, Zap, ArrowRight, Play } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Play className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">ReachInsta</span>
          </div>
          
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </a>
          </div>
          
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a href="/login">
              <Button variant="outline" data-testid="button-login">
                Log In
              </Button>
            </a>
            <a href="/register">
              <Button data-testid="button-get-started">
                Get Started
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </nav>

      <main className="pt-16">
        <section className="py-24 md:py-32">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Zap className="w-3 h-3" />
                  Instagram Reels Intelligence
                </div>
                
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
                  Track Competitors.
                  <br />
                  <span className="text-primary">Discover Viral Reels.</span>
                </h1>
                
                <p className="text-lg text-muted-foreground max-w-lg">
                  ReachInsta helps Instagram creators and agencies analyze competitor Reels, 
                  identify viral content patterns, and optimize posting strategies with data-driven insights.
                </p>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  <a href="/register">
                    <Button size="lg" className="w-full sm:w-auto" data-testid="button-hero-cta">
                      Start Free Trial
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </a>
                  <a href="#features">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      See How It Works
                    </Button>
                  </a>
                </div>
                
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Free forever plan
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    No credit card required
                  </span>
                </div>
              </div>
              
              <div className="relative lg:pl-8">
                <div className="relative rounded-lg border bg-card p-6 shadow-lg">
                  <div className="absolute -top-3 -right-3 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    Live Demo
                  </div>
                  
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Top Viral Reels</span>
                      <span className="text-xs text-muted-foreground">Last 7 days</span>
                    </div>
                    
                    <div className="space-y-3">
                      {[
                        { username: "@creator1", views: "2.4M", engagement: "8.2%" },
                        { username: "@creator2", views: "1.8M", engagement: "6.7%" },
                        { username: "@creator3", views: "1.2M", engagement: "9.1%" },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-md bg-muted/50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/50 to-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                              {i + 1}
                            </div>
                            <span className="font-mono text-sm">{item.username}</span>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-sm">{item.views}</div>
                            <div className="text-xs text-muted-foreground">{item.engagement}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-24 bg-muted/30">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need to Win on Instagram
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Powerful analytics tools designed for creators and agencies who want 
                to stay ahead of the competition.
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card className="hover-elevate">
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Competitor Tracking</h3>
                  <p className="text-muted-foreground">
                    Monitor up to 100 competitors and track their Reels performance 
                    in real-time. Never miss a viral opportunity.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="hover-elevate">
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Viral Detection</h3>
                  <p className="text-muted-foreground">
                    Our proprietary viral score algorithm identifies trending content 
                    before it blows up. Stay ahead of trends.
                  </p>
                </CardContent>
              </Card>
              
              <Card className="hover-elevate">
                <CardContent className="p-6 space-y-4">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold">Deep Analytics</h3>
                  <p className="text-muted-foreground">
                    Analyze posting times, video durations, engagement patterns, 
                    and more with beautiful interactive charts.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-lg text-muted-foreground">
                Start free, upgrade as you grow. No hidden fees.
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              <Card className="relative">
                <CardContent className="p-8 space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold">Free</h3>
                    <p className="text-muted-foreground text-sm mt-1">For getting started</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$0</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      5 competitors
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      7-day time range
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      1 fetch per month
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      No CSV export
                    </li>
                  </ul>
                  <a href="/register" className="block">
                    <Button variant="outline" className="w-full">
                      Get Started
                    </Button>
                  </a>
                </CardContent>
              </Card>
              
              <Card className="relative border-primary">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                  Most Popular
                </div>
                <CardContent className="p-8 space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold">Plus</h3>
                    <p className="text-muted-foreground text-sm mt-1">For growing creators</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$49</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      50 competitors
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      28-day time range
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      2 fetches per month
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      No CSV export
                    </li>
                  </ul>
                  <a href="/register" className="block">
                    <Button className="w-full">
                      Get Started
                    </Button>
                  </a>
                </CardContent>
              </Card>
              
              <Card className="relative">
                <CardContent className="p-8 space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold">Pro</h3>
                    <p className="text-muted-foreground text-sm mt-1">For agencies</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">$99</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      100 competitors
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      28-day time range
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      4 fetches per month
                    </li>
                    <li className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      CSV export included
                    </li>
                  </ul>
                  <a href="/register" className="block">
                    <Button variant="outline" className="w-full">
                      Get Started
                    </Button>
                  </a>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
                <Play className="w-3 h-3 text-primary-foreground" />
              </div>
              <span className="font-semibold">ReachInsta</span>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} ReachInsta. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
