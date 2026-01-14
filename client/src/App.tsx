import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";

import LandingPage from "@/pages/landing";
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
  const [location] = useLocation();

  if (location === "/" && !isLoading && !isAuthenticated) {
    return <LandingPage />;
  }

  if (location === "/" && isAuthenticated) {
    window.location.href = "/dashboard";
    return null;
  }

  if (location === "/") {
    return <LandingPage />;
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
