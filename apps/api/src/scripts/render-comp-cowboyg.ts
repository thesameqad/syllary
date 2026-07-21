import "../load-env.js";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs, songVideos, videoJobs } from "../db/schema.js";
import { runVideoPipeline } from "../lib/video-pipeline.js";
import { presignGet } from "../lib/r2.js";

// One-off comp render (Jul 20 2026): cowboyg2022@gmail.com replied to the
// day-2 drip with "No thank you, I need to see what it looks like before I
// pay" — he never even generated the free preview. Founder-approved comp:
// render his song "Diamond Cowgirl" as a FULL Cinematic video at zero token
// charge, for founder review before deciding to send it to him.
//
//   pnpm tsx --env-file=../../.env src/scripts/render-comp-cowboyg.ts
const SONG_ID = "de0dae93-70f8-485b-83d0-3577510cce32";
const USER_ID = "797e5793-9a36-445d-8e7f-339c84fe0ca9";

const STYLE =
  "Golden-hour western Americana: open ranch plains, dusty backroads, denim and rhinestones, " +
  "warm low sunset light, big sky, cinematic country-music-video aesthetic, shallow depth of field, " +
  "rich color grade, film grain, high detail";

async function main(): Promise<void> {
  const [song] = await db.select().from(songs).where(eq(songs.id, SONG_ID)).limit(1);
  if (!song || song.userId !== USER_ID) throw new Error("Song not found / wrong owner.");
  if (song.status !== "ready" || !song.lyrics?.lines.length) throw new Error("Song not ready.");

  // Mirror startVideoJob's insert exactly, minus the charge (comp: tokensCharged 0).
  const [job] = await db
    .insert(videoJobs)
    .values({
      songId: song.id,
      userId: USER_ID,
      status: "pending",
      mode: "autopilot",
      model: "pro",
      styleDescription: STYLE,
      sceneBrief: null, // pipeline auto-derives the art brief from the song
      aspectRatio: "16:9",
      sceneGrouping: "time",
      imageSize: "2K",
      imageQuality: "fast",
      isPreview: false,
      reuseFrames: false,
      segments: null,
      characterImageKeys: null,
      elementIds: null,
      prerenderImages: true,
      motionMode: "ai",
      tokensCharged: 0,
    })
    .returning();
  if (!job) throw new Error("Could not insert job.");
  console.log(`Job ${job.id} created (comp, 0 tokens). Running pipeline…`);

  const t0 = Date.now();
  await runVideoPipeline(job.id);
  console.log(`Pipeline finished in ${Math.round((Date.now() - t0) / 60000)} min.`);

  const [fresh] = await db.select().from(videoJobs).where(eq(videoJobs.id, job.id)).limit(1);
  console.log(`Job status: ${fresh?.status}${fresh?.error ? ` — ${fresh.error}` : ""}`);
  const [video] = await db
    .select()
    .from(songVideos)
    .where(eq(songVideos.songId, SONG_ID))
    .orderBy(desc(songVideos.createdAt))
    .limit(1);
  if (video?.videoKey) {
    console.log(`R2 key: ${video.videoKey}`);
    console.log(`Presigned (temp): ${await presignGet(video.videoKey)}`);
  }
  process.exit(fresh?.status === "ready" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
