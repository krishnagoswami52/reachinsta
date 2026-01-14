import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlanBadge } from "@/components/dashboard/plan-badge";
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Download,
  Settings,
  Play,
  LogOut,
  Shield,
} from "lucide-react";
import type { Profile } from "@shared/schema";

interface AppSidebarProps {
  profile?: Profile | null;
}

export function AppSidebar({ profile }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const isAdmin = profile?.role === "admin";

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { path: "/competitors", label: "Competitors", icon: Users },
    { path: "/analytics", label: "Analytics", icon: BarChart3 },
    { path: "/exports", label: "Exports", icon: Download },
  ];

  const adminItems = [
    { path: "/admin", label: "Admin Panel", icon: Shield },
  ];

  const competitorProgress = profile 
    ? (profile.fetchesUsed / profile.monthlyFetchLimit) * 100 
    : 0;

  return (
    <Sidebar className="border-r">
      <SidebarHeader className="p-4 border-b">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Play className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">ReachInsta</span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton 
                    asChild
                    isActive={location === item.path}
                  >
                    <Link href={item.path}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton 
                      asChild
                      isActive={location === item.path}
                    >
                      <Link href={item.path}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {profile && (
          <SidebarGroup className="mt-auto">
            <SidebarGroupLabel>Usage</SidebarGroupLabel>
            <SidebarGroupContent className="px-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Fetches used</span>
                  <span className="font-medium">
                    {profile.fetchesUsed}/{profile.monthlyFetchLimit}
                  </span>
                </div>
                <Progress value={competitorProgress} className="h-1.5" />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Competitors</span>
                <span className="font-medium">0/{profile.maxCompetitors}</span>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 border-t">
        <div className="flex items-center gap-3">
          <Avatar className="w-9 h-9">
            <AvatarImage src={user?.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm">
              {user?.firstName?.charAt(0) || user?.email?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {user?.firstName ? `${user.firstName} ${user.lastName || ""}` : user?.email}
            </p>
            {profile && <PlanBadge plan={profile.plan} className="mt-0.5" />}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logout()}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
