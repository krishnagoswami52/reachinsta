import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startWorker } from "./worker";
import { initApifyKeys } from "./services/keyManager";
import paddleWebhookRouter from "./routes/paddleWebhook";
import razorpayWebhookRouter from "./routes/razorpayWebhook";
import cron from "node-cron";
import { downgradeExpiredSubscriptions } from "./jobs/downgrade-expired";
import { autoResetExhaustedKeys } from "./jobs/reset-apify-keys";
import { apiLimiter } from "./middleware/rate-limit";
import adminAnalyticsRouter from "./routes/admin";
import { trackPageView } from "./middleware/tracking";

console.log('[Env Check]', {
  db: !!process.env.DATABASE_URL,
  session: !!process.env.SESSION_SECRET,
  apify: !!process.env.APIFY_TOKEN,
  resend: !!process.env.RESEND_API_KEY,
  paddle_api: !!process.env.PADDLE_API_KEY,
  paddle_webhook: !!process.env.PADDLE_WEBHOOK_SECRET,
  razorpay_api: !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
  razorpay_plans: !!(process.env.RAZORPAY_PLAN_PLUS && process.env.RAZORPAY_PLAN_PRO),
  razorpay_webhook: !!process.env.RAZORPAY_WEBHOOK_SECRET,
  // false in production means every registration will be rejected —
  // verifyTurnstileToken fails closed. See server/lib/turnstile.ts.
  turnstile: !!process.env.TURNSTILE_SECRET_KEY,
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CRITICAL: Paddle + Razorpay webhooks BEFORE express.json()
// — each uses its own express.raw() to get the unparsed body for signature verification
app.use(paddleWebhookRouter);
app.use(razorpayWebhookRouter);
console.log('[Startup] Paddle + Razorpay webhook routes registered');

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Baseline API rate limit (generous — only catches egregious abuse / DoS).
// Skip Paddle webhooks: those are server-to-server and must never be throttled.
app.use("/api/", (req, res, next) => {
  if (req.path.startsWith("/webhooks/")) return next();
  return apiLimiter(req, res, next);
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', ts: Date.now() });
  });

  await registerRoutes(httpServer, app);

  // Admin analytics API (read-only, allow-listed emails). Registered after
  // registerRoutes so the session middleware from setupAuth() is in place.
  // Distinct paths from the existing /api/admin/users routes — nothing shadowed.
  app.use("/api/admin", adminAnalyticsRouter);

  // First-party page-view logging. Sits after every API route and before the
  // SPA catch-all below, so it only sees real page loads. Fire-and-forget.
  app.use(trackPageView);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
    },
    () => {
      log(`serving on port ${port}`);
      initApifyKeys().catch((err) => {
        log(`Failed to initialize Apify keys: ${err.message}`);
      });
      startWorker().catch((err) => {
        log(`Failed to start worker: ${err.message}`);
      });

      // Daily at 1:00 AM UTC. Two independent jobs share the tick; each is
      // wrapped separately so a failure in one still lets the other run.
      cron.schedule(
        "0 1 * * *",
        async () => {
          console.log("[Cron] Running downgrade-expired job");
          try {
            const count = await downgradeExpiredSubscriptions();
            console.log(`[Cron] Downgrade complete: ${count} user(s)`);
          } catch (err) {
            console.error("[Cron] Downgrade job failed:", err);
          }

          // Polls each retired Apify key for its own renewal date and
          // returns the ones whose credit has come back. Runs every day, not
          // on a calendar day: Apify anchors each account's cycle to its
          // signup date, so there is no single date that is right for the
          // pool. Only retired keys are polled.
          try {
            await autoResetExhaustedKeys();
          } catch (err) {
            console.error("[Cron] Apify key reset failed:", err);
          }
        },
        { timezone: "Etc/UTC" },
      );
      log("Daily cron scheduled at 01:00 UTC (downgrade-expired + Apify key renewal check)");
    },
  );
})();
