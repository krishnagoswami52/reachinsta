import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { registerUser, loginUser, sanitizeUser, hashPassword, verifyPassword } from "../../services/auth";
import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from "@shared/models/auth";
import { users as dbUsers } from "@shared/models/auth";
import { storage } from "../../storage";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import {
  createAndSendVerificationEmail,
  verifyEmailCode,
  canResendVerification,
  markEmailSent,
  createAndSendPasswordResetCode,
  canResendPasswordReset,
  markPasswordResetSent,
  resetPasswordWithCode,
} from "../../services/email";
import {
  authLimiter,
  passwordResetRequestLimiter,
  passwordResetCodeLimiter,
  changePasswordLimiter,
} from "../../middleware/rate-limit";

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

  app.post("/api/auth/register", authLimiter, async (req, res) => {
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

  app.post("/api/auth/login", authLimiter, async (req, res) => {
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
      }
      res.clearCookie("connect.sid");
      res.clearCookie("connect.sid", { path: "/" });
      res.clearCookie("connect.sid", { path: "/", sameSite: "lax", secure: false });
      res.clearCookie("connect.sid", { path: "/", sameSite: "lax", secure: true });
      res.json({ message: "Logged out successfully" });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.clearCookie("connect.sid");
      res.clearCookie("connect.sid", { path: "/" });
      res.clearCookie("connect.sid", { path: "/", sameSite: "lax", secure: false });
      res.clearCookie("connect.sid", { path: "/", sameSite: "lax", secure: true });
      res.redirect("/");
    });
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code || typeof code !== "string") {
        return res.status(400).json({ message: "Verification code is required" });
      }

      const result = await verifyEmailCode(code);
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

  app.post("/api/auth/change-email", async (req, res) => {
    try {
      const userId = req.session?.userId;
      if (!userId) {
        return res.status(401).json({ message: "Please log in first" });
      }

      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ message: "Email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.emailVerified) {
        return res.status(400).json({ message: "Cannot change email after verification" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ message: "Email is already in use" });
      }

      const throttleCheck = canResendVerification(userId);
      if (!throttleCheck.allowed) {
        return res.status(429).json({ 
          message: `Please wait ${throttleCheck.waitSeconds} seconds before changing email` 
        });
      }

      await storage.updateUserEmail(userId, email);
      await storage.deleteVerificationTokensForUser(userId);

      const result = await createAndSendVerificationEmail(userId, email);
      if (result.success) {
        markEmailSent(userId);
        res.json({ message: "Email updated and verification sent", email });
      } else {
        res.json({ message: "Email updated but verification email failed to send", email });
      }
    } catch (error) {
      console.error("Change email error:", error);
      res.status(500).json({ message: "Failed to change email" });
    }
  });

  app.post("/api/auth/change-password", changePasswordLimiter, isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({ message: "Current password is required" });
      }
      if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      if (currentPassword === newPassword) {
        return res.status(400).json({ message: "New password must be different from current password" });
      }

      const user = await storage.getUserById(userId);
      if (!user || !user.passwordHash) {
        return res.status(400).json({ message: "No password set for this account" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await db.update(dbUsers).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(dbUsers.id, userId));

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  app.post("/api/auth/forgot-password", passwordResetRequestLimiter, async (req, res) => {
    try {
      const parseResult = forgotPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: parseResult.error.errors[0]?.message || "Invalid input",
        });
      }

      const { email } = parseResult.data;
      const user = await storage.getUserByEmail(email);

      // Always return 200 to prevent user enumeration — never reveal whether an email exists
      if (!user || !user.passwordHash || !user.emailVerified) {
        return res.json({ message: "If that email is registered, a reset code has been sent." });
      }

      const throttleCheck = canResendPasswordReset(user.id);
      if (!throttleCheck.allowed) {
        return res.status(429).json({
          message: `Please wait ${throttleCheck.waitSeconds} seconds before requesting another reset code`,
        });
      }

      const result = await createAndSendPasswordResetCode(user.id, user.email);
      if (!result.success) {
        return res.status(500).json({ message: result.error || "Failed to send reset code" });
      }

      markPasswordResetSent(user.id);
      res.json({ message: "If that email is registered, a reset code has been sent." });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ message: "Failed to send reset code" });
    }
  });

  app.post("/api/auth/reset-password", passwordResetCodeLimiter, async (req, res) => {
    try {
      const parseResult = resetPasswordSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          message: parseResult.error.errors[0]?.message || "Invalid input",
        });
      }

      const { email, code, password } = parseResult.data;
      const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : undefined;
      if (confirmPassword !== undefined && confirmPassword !== password) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      const user = await storage.getUserByEmail(email);

      // Return a generic error — do not confirm whether the email exists
      if (!user || !user.passwordHash || !user.emailVerified) {
        return res.status(400).json({ message: "Invalid or expired reset code" });
      }

      const newPasswordHash = await hashPassword(password);
      const result = await resetPasswordWithCode(user.id, code, newPasswordHash);
      if (!result.success) {
        return res.status(400).json({ message: result.error || "Failed to reset password" });
      }

      res.json({ message: "Password reset successful" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ message: "Failed to reset password" });
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
