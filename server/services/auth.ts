import bcrypt from "bcryptjs";
import { storage } from "../storage";
import type { User, RegisterInput, LoginInput } from "@shared/models/auth";
import type { Profile, SanitizedUser } from "@shared/schema";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(input: RegisterInput): Promise<User> {
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
  });

  return user;
}

export async function loginUser(input: LoginInput): Promise<User> {
  const user = await storage.getUserByEmail(input.email);
  if (!user) {
    throw new Error("Invalid email or password");
  }

  if (!user.passwordHash) {
    throw new Error("Please set a password for your account");
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);
  if (!isValid) {
    throw new Error("Invalid email or password");
  }

  return user;
}

export function sanitizeUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

/** Merges auth user with profile subscription fields into one response object. */
export function buildSanitizedUser(user: User, profile: Profile | undefined): SanitizedUser {
  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    plan: profile?.plan ?? "free",
    subscriptionStatus: profile?.subscriptionStatus ?? "free",
    currentPeriodEnd: profile?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: profile?.cancelAtPeriodEnd ?? false,
    cancelAt: profile?.cancelAt ?? null,
  };
}
