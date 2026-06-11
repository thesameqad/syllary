import "../load-env.js";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { videoJobs } from "../db/schema.js";

const songId = process.argv[2] ?? "0974073d-c76e-4547-bbaf-d2330f9d045a";
const rows = await db
  .select()
  .from(videoJobs)
  .where(eq(videoJobs.songId, songId))
  .orderBy(desc(videoJobs.createdAt))
  .limit(8);

for (const r of rows) {
  console.log({
    id: r.id,
    status: r.status,
    model: r.model,
    mode: r.mode,
    isPreview: r.isPreview,
    reuseFrames: r.reuseFrames,
    completed: r.completedSegments,
    total: r.totalSegments,
    characterImageKeys: r.characterImageKeys,
    segImageKeys: (r.segments ?? []).map((s) => (s.imageKey ? "Y" : "-")).join(""),
    error: r.error,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  });
}
process.exit(0);
