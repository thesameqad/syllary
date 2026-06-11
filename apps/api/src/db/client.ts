import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Connects to Supabase Postgres. TLS comes from `?sslmode=require` in the URL.
//
// The SESSION pooler (port 5432) maps one client to one server connection and
// caps total clients at pool_size (15), which we kept hitting locally (sharing
// the pooler with prod) — surfacing as EMAXCONNSESSION and ECONNRESET. The
// TRANSACTION pooler (port 6543) multiplexes many clients over fewer server
// connections and tolerates churn far better; it requires `prepare: false`
// (no session-level prepared statements). We auto-detect the port so prod can
// keep using the session pooler / direct connection (with prepared statements)
// unchanged, while local dev points at :6543.
const isTransactionPooler = connectionString.includes(":6543");
const client = postgres(connectionString, {
  max: Number(process.env.DB_POOL_MAX ?? 5),
  idle_timeout: 20,
  prepare: !isTransactionPooler,
});

export const db = drizzle(client, { schema, casing: "snake_case" });
