/**
 * Download a song's audio file from R2 to a local path so we can feed it to
 * local WhisperX experiments.
 *
 *   pnpm tsx --env-file=../../.env src/scripts/download-song-audio.ts <songId> [outPath]
 */
import "dotenv/config";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { presignGet } from "../lib/r2.js";

const songId = process.argv[2];
if (!songId) {
  console.error("usage: tsx src/scripts/download-song-audio.ts <songId> [outPath]");
  process.exit(1);
}

const [row] = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
if (!row) {
  console.error("song not found");
  process.exit(1);
}

const ext = row.contentType.includes("flac") ? "flac" : row.contentType.includes("wav") ? "wav" : "mp3";
const outPath = resolve(process.argv[3] ?? `./${songId}.${ext}`);
const url = await presignGet(row.r2Key);

console.log(`downloading from R2 → ${outPath}`);
const res = await fetch(url);
if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
await pipeline(Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream), createWriteStream(outPath));
console.log(`wrote ${outPath}`);
process.exit(0);
