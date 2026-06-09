import "../load-env.js";
import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songVideos } from "../db/schema.js";
import { presignGet } from "../lib/r2.js";

// One-off: download a song's rendered videos (one per style) into the web app's
// public/ folder, to use as the canned format previews in the generate-video modal.
const SONG_ID = "96690eeb-e5f5-4ac6-97de-c29a7a1dc43a";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../../web/public/format-previews");

const rows = await db
  .select({ model: songVideos.model, videoKey: songVideos.videoKey })
  .from(songVideos)
  .where(eq(songVideos.songId, SONG_ID));

console.log(
  "Found videos for models:",
  rows.map((r) => r.model),
);
await mkdir(outDir, { recursive: true });

for (const r of rows) {
  const url = await presignGet(r.videoKey);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED ${r.model}: ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(resolve(outDir, `${r.model}.mp4`), buf);
  console.log(`wrote ${r.model}.mp4 (${(buf.length / 1024).toFixed(0)} KB)`);
}

process.exit(0);
