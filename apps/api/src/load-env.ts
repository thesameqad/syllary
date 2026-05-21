import { resolve } from "node:path";
import { config } from "dotenv";

// Dev convenience: load the monorepo-root .env (scripts run from apps/api).
// In production (Render) the platform injects env vars and no file is found.
config({ path: resolve(process.cwd(), "../../.env") });
