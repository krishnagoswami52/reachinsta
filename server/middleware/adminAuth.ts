import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

/**
 * Role-based gate for the admin analytics dashboard (/api/admin/metrics/*).
 *
 * Mirrors the `isAdmin` middleware that guards the /api/admin/users routes in
 * server/routes.ts: authority comes from `profiles.role === "admin"`, and the
 * SUPER_ADMIN_EMAIL account is self-healed to that role so the founder can
 * never be locked out. Previously this file kept its own hard-coded e-mail
 * allow-list, which disagreed with the role check used everywhere else — an
 * account with role="admin" was offered the dashboard but refused by the API.
 *
 * Must run AFTER `isAuthenticated`, which is what populates `req.user.claims`.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const userId: string | undefined = user?.claims?.sub ?? user?.id;
  const email: string | undefined = (user?.claims?.email ?? user?.email)?.toLowerCase()?.trim();

  if (!user || !userId) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
    const isSuperAdmin = !!email && !!superAdminEmail && email === superAdminEmail;

    let profile = await storage.getProfile(userId);

    if (!profile) {
      profile = await storage.upsertProfile({
        id: userId,
        email,
        role: isSuperAdmin ? "admin" : "user",
        plan: isSuperAdmin ? "pro" : "free",
      });
    } else if (isSuperAdmin && profile.role !== "admin") {
      profile = (await storage.updateProfile(userId, {
        role: "admin",
        plan: "pro",
      })) || profile;
    }

    if (profile.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Error verifying admin access:", error);
    res.status(500).json({ message: "Failed to verify admin access" });
  }
}
