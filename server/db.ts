import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5432/reachinsta";

const isSupabase = connectionString.includes("supabase.co");

const ssl =
  isSupabase
    ? { rejectUnauthorized: process.env.NODE_ENV === "production" }
    : undefined;

export const pool = new Pool({ connectionString, ssl });
export const db = drizzle(pool, { schema });
