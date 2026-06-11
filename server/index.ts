import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { startWorker } from "./worker";
import { initApifyKeys } from "./services/keyManager";
import paddleWebhookRouter from "./routes/paddleWebhook";

console.log('[Env Check]', {
  db: !!process.env.DATABASE_URL,
  session: !!process.env.SESSION_SECRET,
  apify: !!process.env.APIFY_TOKEN,
  resend: !!process.env.RESEND_API_KEY,
  paddle_api: !!process.env.PADDLE_API_KEY,
  paddle_webhook: !!process.env.PADDLE_WEBHOOK_SECRET,
});

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// CRITICAL: Paddle webhook BEFORE express.json()
// — uses its own express.raw() to get the unparsed body for signature verification
app.use(paddleWebhookRouter);
console.log('[Startup] Paddle webhook routes registered');

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

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
    },
  );
})();
