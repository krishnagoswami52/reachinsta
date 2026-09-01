import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * The server now rejects money-spending endpoints with 403 EMAIL_NOT_VERIFIED
 * until the address is proven (server/replit_integrations/auth/customAuth.ts).
 * The router in App.tsx already keeps unverified users on /verify-email, so in
 * normal use nobody sees this — but the two states can drift: a session left
 * open in a background tab, or a change-email that flipped emailVerified back
 * to false after the page loaded. Rather than surface "403: {json}" from those
 * races, send the user to the page that can actually fix it.
 *
 * Returns true when it has taken over, so the caller stops.
 */
async function handleUnverifiedEmail(res: Response): Promise<boolean> {
  if (res.status !== 403) return false;

  let body: any;
  try {
    body = await res.clone().json();
  } catch {
    return false;
  }
  if (body?.code !== "EMAIL_NOT_VERIFIED") return false;

  if (window.location.pathname !== "/verify-email") {
    window.location.href = "/verify-email";
  }
  return true;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (await handleUnverifiedEmail(res)) {
      throw new Error("Please verify your email to use this feature");
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
