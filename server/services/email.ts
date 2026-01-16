import { Resend } from "resend";
import crypto from "crypto";
import { storage } from "../storage";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TOKEN_EXPIRY_HOURS = 24;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

const resendThrottleMap = new Map<string, number>();
const RESEND_THROTTLE_MS = 60 * 1000;

export async function createAndSendVerificationEmail(userId: string, email: string): Promise<{ success: boolean; error?: string }> {
  await storage.deleteVerificationTokensForUser(userId);
  
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  
  await storage.createVerificationToken(userId, tokenHash, expiresAt);
  
  if (!resend) {
    console.warn("Email service not configured (RESEND_API_KEY missing). Token created but email not sent.");
    return { success: false, error: "Email service not configured" };
  }
  
  const baseUrl = process.env.APP_BASE_URL 
    || (process.env.REPLIT_DEPLOYMENT === "1" && process.env.REPLIT_DOMAINS?.split(",")[0]
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : null)
    || "https://reachinstatest.co";
  
  const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
  
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Verify your email - ReachInsta",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px;">ReachInsta</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="margin-top: 0; color: #333;">Verify your email address</h2>
              <p>Thanks for signing up for ReachInsta! Please click the button below to verify your email address.</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Verify Email</a>
              </div>
              <p style="color: #666; font-size: 14px;">This link will expire in ${TOKEN_EXPIRY_HOURS} hours.</p>
              <p style="color: #666; font-size: 14px;">If you didn't create an account with ReachInsta, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${verificationUrl}" style="color: #667eea; word-break: break-all;">${verificationUrl}</a>
              </p>
            </div>
          </body>
        </html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return { success: false, error: "Failed to send email" };
  }
}

export async function verifyEmailToken(token: string): Promise<{ success: boolean; error?: string; userId?: string }> {
  const tokenHash = hashToken(token);
  return storage.verifyEmailAtomic(tokenHash);
}

export function canResendVerification(userId: string): { allowed: boolean; waitSeconds?: number } {
  const lastSent = resendThrottleMap.get(userId);
  const now = Date.now();
  
  if (lastSent && now - lastSent < RESEND_THROTTLE_MS) {
    const waitSeconds = Math.ceil((RESEND_THROTTLE_MS - (now - lastSent)) / 1000);
    return { allowed: false, waitSeconds };
  }
  
  return { allowed: true };
}

export function markEmailSent(userId: string): void {
  resendThrottleMap.set(userId, Date.now());
}
