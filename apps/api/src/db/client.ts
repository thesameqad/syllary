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
//
// The Supabase session pooler caps TOTAL clients at its pool_size (15 by
// default). Keep our per-process pool small so the persistent server — plus a
// parallel local-dev process and the occasional migration, all hitting the same
// pooler — never exhaust it (the EMAXCONNSESSION error). Idle connections are
// released quickly so they free up between bursts.
const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idle_timeout: 20,
});

export const db = drizzle(client, { schema, casing: "snake_case" });
