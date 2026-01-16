import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import DashboardPage from "@/pages/dashboard";
import CompetitorsPage from "@/pages/competitors";
import AnalyticsPage from "@/pages/analytics";
import ExportsPage from "@/pages/exports";
import AdminPage from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

function AuthenticatedRoutes() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/competitors" component={CompetitorsPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/exports" component={ExportsPage} />
        <Route path="/admin" component={AdminPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  if (location === "/login") {
    if (isAuthenticated && !isLoading) {
      setLocation("/dashboard");
      return null;
    }
    return <LoginPage />;
  }

  if (location === "/register") {
    if (isAuthenticated && !isLoading) {
      setLocation("/dashboard");
      return null;
    }
    return <RegisterPage />;
  }

  if (location === "/") {
    if (isAuthenticated && !isLoading) {
      setLocation("/dashboard");
      return null;
    }
    return <LandingPage />;
  }

  if (!isAuthenticated && !isLoading) {
    setLocation("/login");
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AppRouter />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
