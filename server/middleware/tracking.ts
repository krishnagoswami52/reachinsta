import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { pool } from "../db";

/**
 * First-party page-view tracking.
 *
 * Fire-and-forget: the INSERT is never awaited and every failure is swallowed,
 * so a tracking problem (or a missing page_views table) can never slow down or
 * break a user request. Nothing in the product reads this data — it exists only
 * for the admin dashboard at /admin/metrics.
 *
 * Register AFTER the API routes and BEFORE the SPA catch-all (vite / static),
 * so it only sees real page loads.
 */

// Paths we DON'T want to track (assets, API calls, etc.)
const IGNORED_PATHS = [
  "/api/",
  "/assets/",
  "/src/",        // vite dev module graph
  "/@vite",       // vite HMR client
  "/@react-refresh",
  "/@fs/",
  "/node_modules/",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
];

const STATIC_FILE_RE = /\.(js|mjs|cjs|css|map|json|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf|eot|mp4|webm|txt|xml)$/i;

// Column widths in page_views — truncate rather than let an oversized header
// blow up the insert.
const MAX_PATH = 500;
const MAX_REFERRER = 500;
const MAX_SHORT = 100;

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}

function firstQueryValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return null;
}

/**
 * Stable-ish visitor id.
 *
 * Anonymous visitors have no session cookie (express-session runs with
 * saveUninitialized:false), so req.sessionID changes on every request and is
 * useless for counting people. Instead we hash ip + user-agent + calendar day
 * into an opaque id: stable for one visitor for one day, not reversible, and no
 * extra cookie is set on anyone.
 */
function resolveSessionId(req: Request, ip: string | null): string {
  const sessionUserId = (req as any).session?.userId;
  if (sessionUserId && req.sessionID) return `s_${req.sessionID}`.slice(0, MAX_SHORT);

  const day = new Date().toISOString().slice(0, 10);
  const seed = `${ip || "noip"}|${req.headers["user-agent"] || "noua"}|${day}`;
  return `v_${crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32)}`;
}

export function trackPageView(req: Request, _res: Response, next: NextFunction) {
  try {
    // Only real page loads: GET, not an asset, not an API call.
    if (req.method !== "GET") return next();
    if (IGNORED_PATHS.some((p) => req.path.startsWith(p))) return next();
    if (STATIC_FILE_RE.test(req.path)) return next();

    // Respect proxy headers (app runs behind Traefik).
    const forwarded = req.headers["x-forwarded-for"];
    const ip =
      (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : null) ||
      req.socket.remoteAddress ||
      null;

    const country = truncate((req.headers["cf-ipcountry"] as string) || null, 3);

    const values = [
      truncate(req.path, MAX_PATH),
      truncate((req.headers.referer as string) || null, MAX_REFERRER),
      req.headers["user-agent"] || null,
      truncate(ip, 45),
      (req as any).session?.userId || null,
      resolveSessionId(req, ip),
      truncate(firstQueryValue(req.query.utm_source), MAX_SHORT),
      truncate(firstQueryValue(req.query.utm_medium), MAX_SHORT),
      truncate(firstQueryValue(req.query.utm_campaign), MAX_SHORT),
      country === "XX" ? null : country, // Cloudflare's "unknown" sentinel
    ];

    // Not awaited on purpose — the response must never wait on analytics.
    pool
      .query(
        `INSERT INTO page_views (
           path, referrer, user_agent, ip_address, user_id,
           session_id, utm_source, utm_medium, utm_campaign, country
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        values,
      )
      .catch((err) => {
        console.error("[Tracking] Failed to log page view:", err.message);
      });
  } catch (error) {
    // Silent fail — tracking must never break the app.
    console.error("[Tracking] Error:", error);
  }

  next();
}
