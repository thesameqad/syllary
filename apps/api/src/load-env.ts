import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// Dev convenience: load the monorepo-root .env. Try cwd-relative (when run from
// apps/api) and file-relative (when run from the repo root) so either works.
// In production (Render) the platform injects env vars and no file is found.
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(process.cwd(), "../../.env"),
  resolve(here, "../../../.env"),
  resolve(process.cwd(), ".env"),
];
for (const path of candidates) {
  if (existsSync(path)) {
    config({ path });
    break;
  }
}
