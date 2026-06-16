import { Resend } from "resend";
import crypto from "crypto";
import { storage } from "../storage";
import type { ResetPasswordResult } from "../storage";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const TOKEN_EXPIRY_HOURS = 24;
// Shortened from 1 hour to 15 minutes to shrink the brute-force window for the
// 6-digit reset code (audit fix #3).
const PASSWORD_RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000;
const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES = 15;

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateCode(): string {
  const value = crypto.randomInt(0, 1000000);
  return value.toString().padStart(6, "0");
}

const resendThrottleMap = new Map<string, number>();
const RESEND_THROTTLE_MS = 60 * 1000;
const passwordResetThrottleMap = new Map<string, number>();

export async function createAndSendVerificationEmail(userId: string, email: string): Promise<{ success: boolean; error?: string }> {
  await storage.deleteVerificationTokensForUser(userId);
  
  const code = generateCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  
  await storage.createVerificationToken(userId, codeHash, expiresAt);
  
  if (!resend) {
    console.warn("Email service not configured (RESEND_API_KEY missing). Verification code created but email not sent.");
    return { success: false, error: "Email service not configured" };
  }
  
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  
  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Your ReachInsta verification code",
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
              <p>Thanks for signing up for ReachInsta! Use the verification code below to activate your account.</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; padding: 16px 24px; border-radius: 8px; background: #f4f4ff; letter-spacing: 6px; font-size: 24px; font-weight: 700; color: #333; font-family: 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                  ${code}
                </div>
              </div>
              <p style="color: #666; font-size: 14px;">This code will expire in ${TOKEN_EXPIRY_HOURS} hours.</p>
              <p style="color: #666; font-size: 14px;">If you didn't create an account with ReachInsta, you can safely ignore this email.</p>
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

export async function verifyEmailCode(code: string): Promise<{ success: boolean; error?: string; userId?: string }> {
  const codeHash = hashToken(code);
  return storage.verifyEmailAtomic(codeHash);
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

export async function createAndSendPasswordResetCode(
  userId: string,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  await storage.deletePasswordResetTokensForUser(userId);

  const code = generateCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_EXPIRY_MS);

  await storage.createPasswordResetToken(userId, codeHash, expiresAt);

  if (!resend) {
    console.warn("Email service not configured (RESEND_API_KEY missing). Reset code created but email not sent.");
    return { success: false, error: "Email service not configured" };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: "Your ReachInsta password reset code",
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
              <h2 style="margin-top: 0; color: #333;">Reset your password</h2>
              <p>Use the 6-digit code below to reset your ReachInsta password.</p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; padding: 16px 24px; border-radius: 8px; background: #f4f4ff; letter-spacing: 6px; font-size: 24px; font-weight: 700; color: #333; font-family: 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                  ${code}
                </div>
              </div>
              <p style="color: #666; font-size: 14px;">This code will expire in ${PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes.</p>
              <p style="color: #666; font-size: 14px;">If you didn't request a password reset, you can safely ignore this email.</p>
            </div>
          </body>
        </html>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return { success: false, error: "Failed to send email" };
  }
}

export async function resetPasswordWithCode(
  userId: string,
  code: string,
  newPasswordHash: string,
): Promise<ResetPasswordResult> {
  const codeHash = hashToken(code);
  return storage.resetPasswordAtomic(userId, codeHash, newPasswordHash);
}

export function canResendPasswordReset(userId: string): { allowed: boolean; waitSeconds?: number } {
  const lastSent = passwordResetThrottleMap.get(userId);
  const now = Date.now();

  if (lastSent && now - lastSent < RESEND_THROTTLE_MS) {
    const waitSeconds = Math.ceil((RESEND_THROTTLE_MS - (now - lastSent)) / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

export function markPasswordResetSent(userId: string): void {
  passwordResetThrottleMap.set(userId, Date.now());
}
