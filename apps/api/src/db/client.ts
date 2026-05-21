import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Connects to Supabase Postgres via the session pooler (port 5432); TLS comes
// from `?sslmode=require` in DATABASE_URL. If you switch to the transaction
// pooler (port 6543) for a serverless deploy, add `{ prepare: false }` here.
const client = postgres(connectionString);

export const db = drizzle(client, { schema, casing: "snake_case" });
