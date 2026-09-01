import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { contactQueries } from "@shared/schema";
import { sendContactNotification } from "../services/email";
import { contactLimiter } from "../middleware/rate-limit";

/**
 * Public contact form API.
 *
 * Unauthenticated by design — anyone can reach it, so it carries its own
 * defenses: an IP rate limit (3/hour), a honeypot field, and hard length caps
 * that mirror the contact_queries column widths.
 *
 * Order matters: the row is written BEFORE the notification email, and the
 * email is fire-and-forget. A Resend outage must never turn into a lost lead
 * or a 500 shown to the visitor.
 */
const router = Router();

// Lengths mirror contact_queries in shared/schema.ts. Anything longer is a
// bug or an attack, not a real message.
const contactSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100, "Name is too long"),
  email: z.string().trim().email("Please enter a valid email address").max(255, "Email is too long"),
  company: z.string().trim().max(200, "Company name is too long").optional(),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least 10 characters")
    .max(5000, "Message is too long (5000 characters max)"),
});

router.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    // Honeypot. `website` is hidden from real users, so anything in it is a
    // bot. Checked on the raw body BEFORE validation so the bot gets a plain
    // 200 and never learns which field caught it.
    const honeypot = req.body?.website;
    if (typeof honeypot === "string" && honeypot.trim().length > 0) {
      console.warn("[Contact] Honeypot triggered, submission dropped");
      return res.json({ message: "Thanks — your message is on its way." });
    }

    const parsed = contactSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message || "Please check the form and try again.",
        code: "INVALID_INPUT",
      });
    }

    const { name, email, company, message } = parsed.data;

    const ip = (req.ip || req.socket.remoteAddress || null)?.slice(0, 45) ?? null;
    const userAgent = req.headers["user-agent"] || null;

    const [query] = await db
      .insert(contactQueries)
      .values({
        name,
        email,
        company: company || null,
        message,
        ipAddress: ip,
        userAgent,
      })
      .returning();

    console.log(`[Contact] Query #${query.id} saved from ${email}`);

    // Not awaited on purpose — the query is already durable, so the visitor
    // should not wait on Resend (or fail because of it).
    sendContactNotification({
      queryId: query.id,
      name,
      email,
      company,
      message,
      ip,
      createdAt: query.createdAt,
    })
      .then((result) => {
        if (!result.success) {
          console.error(`[Contact] Notification for query #${query.id} not sent: ${result.error}`);
        }
      })
      .catch((err) => {
        console.error(`[Contact] Notification for query #${query.id} threw:`, err);
      });

    res.json({ message: "Thanks — your message is on its way." });
  } catch (error) {
    console.error("[Contact] Error:", error);
    res.status(500).json({
      message: "Couldn't send your message. Please try again, or email krishna@reachinsta.co directly.",
    });
  }
});

export default router;
