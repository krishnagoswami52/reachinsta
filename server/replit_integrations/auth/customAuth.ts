import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { registerUser, loginUser, sanitizeUser } from "../../services/auth";
import { registerSchema, loginSchema } from "@shared/models/auth";
import { storage } from "../../storage";
import { createAndSendVerificationEmail, verifyEmailToken, canResendVerification, markEmailSent } from "../../services/email";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax",
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parseResult = registerSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }

      const user = await registerUser(parseResult.data);
      req.session.userId = user.id;
      
      await storage.upsertProfile({
        id: user.id,
        email: user.email,
        role: "user",
        plan: "free",
      });

      let emailVerificationSent = false;
      try {
        const emailResult = await createAndSendVerificationEmail(user.id, user.email);
        emailVerificationSent = emailResult.success;
        if (emailResult.success) {
          markEmailSent(user.id);
        } else {
          console.warn("Email verification not sent:", emailResult.error);
        }
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
      }

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Registration failed" });
        }
        res.json({ ...sanitizeUser(user), emailVerificationSent });
      });
    } catch (error: any) {
      if (error.message === "Email already registered") {
        return res.status(409).json({ message: error.message });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parseResult = loginSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ 
          message: parseResult.error.errors[0]?.message || "Invalid input" 
        });
      }

      const user = await loginUser(parseResult.data);
      req.session.userId = user.id;

      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        res.json(sanitizeUser(user));
      });
    } catch (error: any) {
      if (error.message === "Invalid email or password") {
        return res.status(401).json({ message: error.message });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      if (!token || typeof token !== "string") {
        return res.status(400).json({ message: "Verification token is required" });
      }

      const result = await verifyEmailToken(token);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      console.error("Email verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.emailVerified) {
        return res.status(400).json({ message: "Email is already verified" });
      }

      const throttleCheck = canResendVerification(userId);
      if (!throttleCheck.allowed) {
        return res.status(429).json({ 
          message: `Please wait ${throttleCheck.waitSeconds} seconds before requesting another email` 
        });
      }

      const result = await createAndSendVerificationEmail(user.id, user.email);
      if (result.success) {
        markEmailSent(userId);
        res.json({ message: "Verification email sent" });
      } else {
        res.status(500).json({ message: result.error || "Failed to send verification email" });
      }
    } catch (error) {
      console.error("Resend verification error:", error);
      res.status(500).json({ message: "Failed to send verification email" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  const userId = req.session?.userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await storage.getUserById(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    req.user = {
      claims: {
        sub: user.id,
        email: user.email,
      },
    };
    
    next();
  } catch (error) {
    console.error("Auth check error:", error);
    res.status(401).json({ message: "Unauthorized" });
  }
};
