import type { Express } from "express";
import express from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { isAuthenticated } from "./customAuth";
import { sanitizeUser, buildSanitizedUser } from "../../services/auth";

const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).nullable().optional(),
  lastName: z.string().min(1).max(50).nullable().optional(),
  profileImageUrl: z.string().max(2 * 1024 * 1024).nullable().optional(),
});

export function registerAuthRoutes(app: Express): void {
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const [user, profile] = await Promise.all([
        storage.getUserById(userId),
        storage.getProfile(userId),
      ]);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(buildSanitizedUser(user, profile));
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.patch("/api/auth/user", express.json({ limit: "3mb" }), isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const parseResult = updateUserSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: parseResult.error.errors[0]?.message || "Invalid input" });
      }
      const updates = parseResult.data;
      const user = await storage.updateUser(userId, updates);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(sanitizeUser(user));
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });
}
