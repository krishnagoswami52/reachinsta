import type { Request, Response, NextFunction } from "express";

/**
 * Hard-coded allow-list for the admin analytics dashboard (/api/admin/metrics/*).
 *
 * Deliberately separate from the `profiles.role === "admin"` check used by the
 * existing /api/admin/users routes: this dashboard exposes business-wide
 * revenue and traffic data, so it is gated on identity alone and cannot be
 * granted by flipping a row in the database.
 *
 * SUPER_ADMIN_EMAIL (already required at boot by server/routes.ts) is honoured
 * too, so the founder account stays in sync with the rest of the app.
 */
const ADMIN_EMAILS = [
  "krishna@techcm.in",
  "krishnagoswami52@gmail.com",
  "krishna@reachinsta.com",
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const superAdmin = process.env.SUPER_ADMIN_EMAIL?.toLowerCase().trim();
  return ADMIN_EMAILS.includes(normalized) || (!!superAdmin && normalized === superAdmin);
}

/**
 * Must run AFTER `isAuthenticated`, which is what populates
 * `req.user = { claims: { sub, email } }`.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const email: string | undefined = user?.claims?.email ?? user?.email;

  if (!user || !email) {
    return res.status(401).json({ message: "Authentication required" });
  }

  if (!isAdminEmail(email)) {
    return res.status(403).json({ message: "Admin access required" });
  }

  next();
}

export { ADMIN_EMAILS };
