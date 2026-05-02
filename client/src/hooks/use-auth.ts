import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import type { User } from "@shared/models/auth";

const AUTH_EPOCH_KEY = "auth:epoch";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", {
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Logout failed");
  }
}

export function useAuth() {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const authEpochRef = useRef<string | null>(null);
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    const disableBfcache = () => {};
    window.addEventListener("beforeunload", disableBfcache);
    window.addEventListener("unload", disableBfcache);

    if (authEpochRef.current === null) {
      try {
        authEpochRef.current = localStorage.getItem(AUTH_EPOCH_KEY);
      } catch {
        authEpochRef.current = null;
      }
    }

    const syncAuthState = () => {
      let latestEpoch: string | null = null;
      try {
        latestEpoch = localStorage.getItem(AUTH_EPOCH_KEY);
      } catch {
        queryClient.clear();
        setLocation("/login", { replace: true });
        return;
      }

      if (latestEpoch !== authEpochRef.current) {
        authEpochRef.current = latestEpoch;
        queryClient.clear();
        queryClient.setQueryData(["/api/auth/user"], null);
        setLocation("/login", { replace: true });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        syncAuthState();
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncAuthState();
      }
    };

    window.addEventListener("popstate", syncAuthState);
    window.addEventListener("pageshow", handlePageShow as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("beforeunload", disableBfcache);
      window.removeEventListener("unload", disableBfcache);
      window.removeEventListener("popstate", syncAuthState);
      window.removeEventListener("pageshow", handlePageShow as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [queryClient, setLocation]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear();
      localStorage.setItem(AUTH_EPOCH_KEY, String(Date.now()));
      setLocation("/login", { replace: true });
    },
    onError: () => {
      queryClient.clear();
      localStorage.setItem(AUTH_EPOCH_KEY, String(Date.now()));
      setLocation("/login", { replace: true });
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,
  };
}
