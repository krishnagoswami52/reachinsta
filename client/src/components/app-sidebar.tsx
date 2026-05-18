import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Download,
  LogOut,
  Shield,
  Sparkles,
} from "lucide-react";
import type { Profile, Competitor } from "@shared/schema";

interface AppSidebarProps {
  profile?: Profile | null;
}

export function AppSidebar({ profile }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ["/api/competitors"],
    enabled: !!profile,
  });

  const isAdmin = profile?.role === "admin";

  const navItems = [
    { path: "/dashboard",   label: "Dashboard",  icon: LayoutDashboard },
    { path: "/competitors", label: "Competitors", icon: Users },
    { path: "/analytics",   label: "Analytics",  icon: BarChart3 },
    { path: "/exports",     label: "Exports",     icon: Download },
  ];

  const adminItems = [
    { path: "/admin", label: "Admin Panel", icon: Shield },
  ];

  const fetchesUsed   = profile?.fetchesUsed       ?? 0;
  const fetchesLimit  = profile?.monthlyFetchLimit  ?? 1;
  const competitorMax = profile?.maxCompetitors     ?? 5;
  const fetchPct      = Math.min((fetchesUsed / fetchesLimit) * 100, 100);
  const compPct       = Math.min((competitors.length / competitorMax) * 100, 100);

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : (user?.email ?? "User");

  const initials = (user?.firstName?.charAt(0) ?? user?.email?.charAt(0) ?? "U").toUpperCase();

  return (
    <aside className="bg-bg-base border-r border-border-subtle w-[240px] h-screen lg:fixed lg:left-0 lg:top-0 flex flex-col lg:z-40">
      {/* Logo */}
      <div className="shrink-0 px-6 py-5 border-b border-border-subtle">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" stroke="#7CFFB2"/>
              <path d="M8 6L16 11L8 16V6Z" fill="#7CFFB2"/>
            </svg>
            <span className="font-tight font-semibold text-[18px] tracking-tighter-2 text-text-primary">
              ReachInsta
            </span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-6">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted px-3 mb-2">
            // NAVIGATION
          </div>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const active = location === item.path;
              return (
                <Link key={item.path} href={item.path}>
                  <div
                    className={`
                      flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors cursor-pointer
                      ${active
                        ? "bg-bg-surface text-text-primary border border-border-subtle"
                        : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"}
                    `}
                  >
                    <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {isAdmin && (
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted px-3 mb-2">
              // ADMINISTRATION
            </div>
            <div className="space-y-0.5">
              {adminItems.map((item) => {
                const active = location === item.path;
                return (
                  <Link key={item.path} href={item.path}>
                    <div
                      className={`
                        flex items-center gap-3 px-3 py-2 rounded-md text-[14px] transition-colors cursor-pointer
                        ${active
                          ? "bg-bg-surface text-text-primary border border-border-subtle"
                          : "text-text-secondary hover:bg-bg-surface hover:text-text-primary"}
                      `}
                    >
                      <item.icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      {item.label}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {profile && profile.plan !== "pro" && (
          <Link href="/pricing">
            <div className="flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-text-muted hover:text-text-secondary border border-border-subtle hover:border-border-soft transition-colors cursor-pointer">
              <Sparkles className="w-3.5 h-3.5 text-mint" strokeWidth={1.5} />
              Upgrade Plan
            </div>
          </Link>
        )}
      </nav>

      {/* Usage */}
      {profile && (
        <div className="shrink-0 px-6 py-4 border-t border-border-subtle space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            // USAGE
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-text-secondary">Fetches used</span>
              <span className="font-mono text-[12px] text-text-primary">{fetchesUsed}/{fetchesLimit}</span>
            </div>
            <div className="h-1 bg-bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-mint transition-all" style={{ width: `${fetchPct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[12px] text-text-secondary">Competitors</span>
              <span className="font-mono text-[12px] text-text-primary">{competitors.length}/{competitorMax}</span>
            </div>
            <div className="h-1 bg-bg-surface rounded-full overflow-hidden">
              <div className="h-full bg-mint transition-all" style={{ width: `${compPct}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* User card */}
      <div className="shrink-0 px-4 py-4 border-t border-border-subtle flex items-center justify-between gap-2">
        <Link href="/profile" className="flex items-center gap-2.5 min-w-0 flex-1 hover:bg-bg-surface rounded-md p-1 -m-1 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-border-soft to-border-subtle flex items-center justify-center text-[12px] font-semibold border border-border-subtle text-text-primary shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] text-text-primary truncate max-w-[110px]">{displayName}</div>
            {profile && (
              <div className="font-mono text-[10px] uppercase tracking-wider text-mint">
                // {profile.plan}
              </div>
            )}
          </div>
        </Link>
        <button
          className="text-text-muted hover:text-mint transition-colors p-1.5 rounded hover:bg-bg-surface shrink-0"
          onClick={() => logout()}
          data-testid="button-logout"
          title="Log out"
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}
