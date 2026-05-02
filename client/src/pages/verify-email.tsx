import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, CheckCircle, XCircle, RefreshCw, LogOut, ChevronDown, ChevronUp, LogIn } from "lucide-react";
import logoImage from "@assets/ChatGPT_Image_Jan_16,_2026,_06_13_41_PM_1768567542199.png";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import type { User } from "@shared/models/auth";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logout, isLoggingOut } = useAuth();
  const [verificationStatus, setVerificationStatus] = useState<"pending" | "verifying" | "success" | "error">("pending");
  const [errorMessage, setErrorMessage] = useState("");
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  
  const { data: user, refetch: refetchUser } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
  });
  
  useEffect(() => {
    if (user?.emailVerified) {
      const next = new URLSearchParams(window.location.search).get("next");
      setLocation(next || "/dashboard");
    }
  }, [user, setLocation]);

  const verifyMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
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
      const next = new URLSearchParams(window.location.search).get("next");
      setTimeout(() => setLocation(next || "/dashboard"), 2000);
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
      toast({ title: "Email sent!", description: "Check your inbox for the verification code" });
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

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length !== 6) {
      return;
    }
    setVerificationStatus("verifying");
    verifyMutation.mutate(code);
  };

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
            onClick={() => setLocation("/")}
            className="flex items-center gap-2 hover-elevate rounded-md px-2 py-1"
            data-testid="button-logo-home"
          >
            <img src={logoImage} alt="ReachInsta" className="w-8 h-8 rounded-md object-cover" />
            <span className="font-semibold text-lg">ReachInsta</span>
          </button>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              disabled={isLoggingOut}
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
            {verificationStatus === "pending" && (
              <>
                <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Verify Your Email</CardTitle>
                <CardDescription>
                  We sent a verification code to{" "}
                  <span className="font-medium text-foreground" data-testid="text-user-email">
                    {user?.email || "your email"}
                  </span>
                </CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {verificationStatus !== "success" && (
              <form onSubmit={handleVerify} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    disabled={verificationStatus === "verifying"}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={verificationStatus === "verifying" || code.length !== 6}
                  data-testid="button-verify-email-code"
                >
                  {verificationStatus === "verifying" ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>Verify Email</>
                  )}
                </Button>
              </form>
            )}

            {verificationStatus === "pending" && (
              <>
                <div className="text-center text-sm text-muted-foreground">
                  <p>Didn't receive the email?</p>
                  <p className="mt-1">Check your spam folder or request a new code below.</p>
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
                    onClick={() => logout()}
                    disabled={isLoggingOut}
                    data-testid="button-go-to-login"
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    {isLoggingOut ? "Signing out..." : "Sign out & Login with different account"}
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
