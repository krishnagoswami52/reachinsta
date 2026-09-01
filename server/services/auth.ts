import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import type { User, RegisterInput, LoginInput } from "@shared/models/auth";
import type { Profile, SanitizedUser } from "@shared/schema";

const SALT_ROUNDS = 12;

// Pre-computed once at startup. Used to run a bcrypt comparison even when no
// matching user exists, so login response timing is the same whether or not the
// email is registered (defeats timing-based account enumeration).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("reachinsta-timing-defense-dummy-password", SALT_ROUNDS);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * @param ipAddress client IP at signup, already normalised by the caller.
 *                  Written once and never updated — it records where the
 *                  account was created, not where it was last used.
 */
export async function registerUser(input: RegisterInput, ipAddress: string | null = null): Promise<User> {
  const existingUser = await storage.getUserByEmail(input.email);
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);
  
  const user = await storage.createUser({
    email: input.email,
    passwordHash,
    firstName: input.firstName || null,
    lastName: input.lastName || null,
    ipAddress,
  });

  return user;
}

export async function loginUser(input: LoginInput): Promise<User> {
  const user = await storage.getUserByEmail(input.email);

  // Always run a bcrypt comparison — against the real hash if the user exists,
  // otherwise against a dummy hash — so the response takes the same time whether
  // or not the email is registered. Never reveal which factor failed.
  const hashToCompare = user?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordValid = await verifyPassword(input.password, hashToCompare);

  if (!user || !user.passwordHash || !passwordValid) {
    throw new Error("Invalid email or password");
  }

  return user;
}

/**
 * Destroys sessions for a user by deleting rows from the connect-pg-simple
 * `sessions` table whose serialized session JSON carries the matching userId.
 *
 * Session shape (verified against the live table): the `sess` jsonb column
 * stores `userId` at the top level — i.e. `sess->>'userId'`. The unqualified
 * `sessions` name resolves to public.sessions via search_path (the unrelated
 * Supabase auth.sessions table has no `sess` column).
 *
 * @param userId          user whose sessions to destroy
 * @param exceptCurrentSid if given, keep this session (used on a voluntary
 *                         password change so the actor stays logged in)
 * @returns number of sessions destroyed
 */
export async function destroyUserSessions(userId: string, exceptCurrentSid?: string): Promise<number> {
  const result = exceptCurrentSid
    ? await db.execute(
        sql`DELETE FROM sessions WHERE sess->>'userId' = ${userId} AND sid <> ${exceptCurrentSid}`,
      )
    : await db.execute(sql`DELETE FROM sessions WHERE sess->>'userId' = ${userId}`);

  const count = result.rowCount ?? 0;
  console.log(`[Auth] Destroyed ${count} session(s) for user ${userId}${exceptCurrentSid ? " (kept current)" : ""}`);
  return count;
}

export function sanitizeUser(user: User): Omit<User, "passwordHash" | "ipAddress"> {
  const { passwordHash, ipAddress, ...safeUser } = user;
  return safeUser;
}

/** Merges auth user with profile subscription fields into one response object. */
export function buildSanitizedUser(user: User, profile: Profile | undefined): SanitizedUser {
  const { passwordHash, ipAddress, ...safeUser } = user;
  return {
    ...safeUser,
    plan: profile?.plan ?? "free",
    subscriptionStatus: profile?.subscriptionStatus ?? "free",
    currentPeriodEnd: profile?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: profile?.cancelAtPeriodEnd ?? false,
    cancelAt: profile?.cancelAt ?? null,
  };
}
