import "../load-env.js";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { songs } from "../db/schema.js";
import { resolveArtistAlbum } from "../lib/catalog.js";

// One-time (idempotent) backfill: create artist/album entities from the existing
// denormalized songs.artist/album strings and link each song's FKs. Safe to
// re-run — resolveArtistAlbum is find-or-create.
//   Run:  pnpm --filter @syllary/api exec tsx src/scripts/backfill-catalog.ts

const rows = await db
  .select({ id: songs.id, userId: songs.userId, artist: songs.artist, album: songs.album })
  .from(songs)
  .where(isNotNull(songs.userId));

let linked = 0;
for (const r of rows) {
  if (!r.userId || (!r.artist && !r.album)) continue;
  const { artistId, albumId } = await resolveArtistAlbum(r.userId, r.artist, r.album);
  await db.update(songs).set({ artistId, albumId, updatedAt: new Date() }).where(eq(songs.id, r.id));
  linked++;
}

console.log(`backfill-catalog: linked ${linked} of ${rows.length} owned songs`);
process.exit(0);
