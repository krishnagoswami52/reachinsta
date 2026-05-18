import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

import LandingPage from "@/pages/landing";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import FeaturesPage from "@/pages/features";
import VerifyEmailPage from "@/pages/verify-email";
import DashboardPage from "@/pages/dashboard";
import CompetitorsPage from "@/pages/competitors";
import AnalyticsPage from "@/pages/analytics";
import ExportsPage from "@/pages/exports";
import AdminPage from "@/pages/admin";
import ProfilePage from "@/pages/profile";
import PricingPage from "@/pages/pricing";
import BillingPage from "@/pages/billing";
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
        <Route path="/profile" component={ProfilePage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/account/billing" component={BillingPage} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AppRouter() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [location, setLocation] = useLocation();
  const isEmailVerified = user?.emailVerified ?? false;

  // Helper: read ?next= from current URL search params
  const getNext = () => new URLSearchParams(window.location.search).get("next") || "/dashboard";

  if (location === "/login") {
    if (isAuthenticated && !isLoading) {
      if (!isEmailVerified) {
        setLocation("/verify-email", { replace: true });
        return null;
      }
      setLocation(getNext(), { replace: true });
      return null;
    }
    return <LoginPage />;
  }

  if (location === "/register" || location === "/signup") {
    if (isAuthenticated && !isLoading) {
      if (!isEmailVerified) {
        const next = new URLSearchParams(window.location.search).get("next");
        setLocation(next ? `/verify-email?next=${encodeURIComponent(next)}` : "/verify-email", { replace: true });
        return null;
      }
      setLocation(getNext(), { replace: true });
      return null;
    }
    return <RegisterPage />;
  }

  if (location === "/reset-password" || location.startsWith("/reset-password?")) {
    return <ResetPasswordPage />;
  }

  if (location === "/features") {
    return <FeaturesPage />;
  }

  if (location === "/forgot-password") {
    if (isAuthenticated && !isLoading) {
      if (!isEmailVerified) {
        setLocation("/verify-email", { replace: true });
        return null;
      }
      setLocation("/dashboard", { replace: true });
      return null;
    }
    return <ForgotPasswordPage />;
  }

  if (location === "/verify-email" || location.startsWith("/verify-email?")) {
    return <VerifyEmailPage />;
  }

  // /pricing is accessible to both authenticated and unauthenticated users
  if (location === "/pricing") {
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      );
    }
    if (isAuthenticated) {
      if (!isEmailVerified) {
        setLocation("/verify-email", { replace: true });
        return null;
      }
      return <AuthenticatedRoutes />;
    }
    return <PricingPage />;
  }

  if (location === "/") {
    if (isAuthenticated && !isLoading) {
      if (!isEmailVerified) {
        setLocation("/verify-email", { replace: true });
        return null;
      }
      setLocation("/dashboard", { replace: true });
      return null;
    }
    return <LandingPage />;
  }

  if (!isAuthenticated && !isLoading) {
    setLocation("/login", { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isEmailVerified) {
    setLocation("/verify-email", { replace: true });
    return null;
  }

  return <AuthenticatedRoutes />;
}

function App() {
  useEffect(() => {
    const handler = () => {
      // Give Paddle overlay time to close before navigating
      setTimeout(() => {
        window.location.href = '/account/billing?success=true';
      }, 1500);
    };
    window.addEventListener('paddle:checkout-completed', handler);
    return () => window.removeEventListener('paddle:checkout-completed', handler);
  }, []);

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
