import { useState, useEffect } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Play, Loader2, Mail, CheckCircle, XCircle, RefreshCw, LogOut, ChevronDown, ChevronUp, LogIn } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/models/auth";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verifying" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState("");
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const token = new URLSearchParams(search).get("token");
  
  const { data: user, refetch: refetchUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
  });
  
  useEffect(() => {
    if (user?.emailVerified && !token) {
      setLocation("/dashboard");
    }
  }, [user, token, setLocation]);

  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Verification failed");
      }
      return response.json();
    },
    onSuccess: () => {
      setVerificationStatus("success");
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Email verified!", description: "Your account is now active" });
      setTimeout(() => setLocation("/dashboard"), 2000);
    },
    onError: (error: Error) => {
      setVerificationStatus("error");
      setErrorMessage(error.message);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to resend");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Email sent!", description: "Check your inbox for the verification link" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send", description: error.message, variant: "destructive" });
    },
  });

  const changeEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await fetch("/api/auth/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to change email");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setShowChangeEmail(false);
      setNewEmail("");
      refetchUser();
      toast({ title: "Email updated!", description: `Verification sent to ${data.email}` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Logout failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setLocation("/");
    },
  });

  useEffect(() => {
    if (token && verificationStatus === "pending") {
      setVerificationStatus("verifying");
      verifyMutation.mutate(token);
    }
  }, [token]);

  const handleChangeEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (newEmail && newEmail !== user?.email) {
      changeEmailMutation.mutate(newEmail);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <button
            onClick={() => logoutMutation.mutate()}
            className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1"
            data-testid="button-logo-home"
          >
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <Play className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">ReachInsta</span>
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {verificationStatus === "verifying" && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <CardTitle className="text-2xl">Verifying Email</CardTitle>
                <CardDescription>Please wait while we verify your email address...</CardDescription>
              </>
            )}
            {verificationStatus === "success" && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-2xl">Email Verified!</CardTitle>
                <CardDescription>Your email has been verified. Redirecting to dashboard...</CardDescription>
              </>
            )}
            {verificationStatus === "error" && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                  <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <CardTitle className="text-2xl">Verification Failed</CardTitle>
                <CardDescription>{errorMessage}</CardDescription>
              </>
            )}
            {verificationStatus === "pending" && !token && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Check Your Email</CardTitle>
                <CardDescription>
                  We sent a verification link to{" "}
                  <span className="font-medium text-foreground" data-testid="text-user-email">
                    {user?.email || "your email"}
                  </span>
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {verificationStatus === "pending" && !token && (
              <>
                <div className="text-center text-sm text-muted-foreground">
                  <p>Didn't receive the email?</p>
                  <p className="mt-1">Check your spam folder or request a new link below.</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  data-testid="button-resend-verification"
                >
                  {resendMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Resend Verification Email
                    </>
                  )}
                </Button>

                <div className="border-t pt-4">
                  <button
                    type="button"
                    onClick={() => setShowChangeEmail(!showChangeEmail)}
                    className="flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="button-toggle-change-email"
                  >
                    {showChangeEmail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    Wrong email? Change it here
                  </button>
                  
                  {showChangeEmail && (
                    <form onSubmit={handleChangeEmail} className="mt-4 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="new-email">New Email Address</Label>
                        <Input
                          id="new-email"
                          type="email"
                          placeholder="Enter correct email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          required
                          data-testid="input-new-email"
                        />
                        <p className="text-xs text-muted-foreground">
                          This will invalidate any previous verification links.
                        </p>
                      </div>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={changeEmailMutation.isPending || !newEmail || newEmail === user?.email}
                        data-testid="button-submit-change-email"
                      >
                        {changeEmailMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Updating...
                          </>
                        ) : (
                          "Update Email & Resend Verification"
                        )}
                      </Button>
                    </form>
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="text-center text-sm text-muted-foreground mb-3">
                    Already have another verified account?
                  </p>
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => logoutMutation.mutate()}
                    disabled={logoutMutation.isPending}
                    data-testid="button-go-to-login"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {logoutMutation.isPending ? "Signing out..." : "Sign out & Login with different account"}
                  </Button>
                </div>
              </>
            )}
            {verificationStatus === "error" && (
              <>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => resendMutation.mutate()}
                  disabled={resendMutation.isPending}
                  data-testid="button-resend-after-error"
                >
                  {resendMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Request New Verification Link
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => setLocation("/login")}
                  data-testid="button-back-to-login"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  Back to Login
                </Button>
              </>
            )}
            {verificationStatus === "success" && (
              <Button
                className="w-full"
                onClick={() => setLocation("/dashboard")}
                data-testid="button-go-to-dashboard"
              >
                Go to Dashboard
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
