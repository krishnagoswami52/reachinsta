import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu } from "lucide-react";
import type { Profile } from "@shared/schema";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: profile, isLoading: profileLoading } = useQuery<Profile>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation("/login", { replace: true });
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [location]);

  // Escape key closes sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Body scroll lock when drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="space-y-4 text-center">
          <Skeleton className="h-12 w-12 rounded-full mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-bg-base">
      {/* Desktop sidebar — fixed, rendered outside flow */}
      <div className="hidden lg:block">
        <AppSidebar profile={profile} />
      </div>

      {/* Mobile sidebar: backdrop + slide-in drawer */}
      <div
        className={`lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div className={`lg:hidden fixed left-0 top-0 z-50 h-screen transition-transform duration-300 ease-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <AppSidebar profile={profile} onClose={() => setSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 min-w-0 lg:ml-[240px]">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 border-b border-border-subtle bg-bg-base px-4 py-3">
          <button
            className="text-text-muted hover:text-text-primary transition-colors"
            onClick={() => setSidebarOpen(true)}
            data-testid="button-sidebar-toggle"
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <span className="font-tight font-semibold text-[16px] text-text-primary">ReachInsta</span>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
