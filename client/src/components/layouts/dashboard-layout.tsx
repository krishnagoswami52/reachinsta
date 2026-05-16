import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { AppSidebar } from "@/components/app-sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Menu } from "lucide-react";
import { useState } from "react";
import type { Profile } from "@shared/schema";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
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
    <div className="flex min-h-screen w-full bg-bg-base">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex">
        <AppSidebar profile={profile} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10">
            <AppSidebar profile={profile} />
          </div>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
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
