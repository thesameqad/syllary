/**
 * Apply a previously-staged Lyrics JSON (written by test-mms-per-line.ts)
 * to the corresponding song row. Exists as a separate script because
 * Drizzle's postgres-js connection wedges silently when db.update is called
 * after a multi-minute synchronous child_process in the same process.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";

import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import type { Lyrics } from "@syllary/shared";

const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const stagedPath = join(REPO_ROOT, "cog", "mms-aligner", "staged-lyrics.json");

const staged = JSON.parse(readFileSync(stagedPath, "utf-8")) as {
  songId: string;
  lyrics: Lyrics;
};

console.error(`Applying staged lyrics → song ${staged.songId} (${staged.lyrics.lines.length} lines)…`);
await db.update(songs).set({ lyrics: staged.lyrics, updatedAt: new Date() }).where(eq(songs.id, staged.songId));
console.error(`Done. Reload /s/${staged.songId} in the browser.`);
process.exit(0);
