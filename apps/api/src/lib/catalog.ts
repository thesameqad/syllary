import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { albums, artists } from "../db/schema.js";

// Find-or-create artist/album entities for a user, matched case-insensitively by
// name. Keeps the `songs.artist`/`album` string cache and the FK entities in
// sync. An album entity is only created when BOTH an artist and an album name
// exist (an album belongs to an artist); "singles" stay albumId=null.

/** Get-or-create an artist by name (case-insensitive) for a user. */
export async function upsertArtist(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const found = await findArtist(userId, trimmed);
  if (found) return found;
  const [created] = await db
    .insert(artists)
    .values({ userId, name: trimmed })
    .onConflictDoNothing()
    .returning({ id: artists.id });
  if (created) return created.id;
  // Lost a race — re-read.
  return (await findArtist(userId, trimmed))!;
}

/** Get-or-create an album (under an artist) by name (case-insensitive). */
export async function upsertAlbum(
  userId: string,
  artistId: string,
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  const found = await findAlbum(userId, artistId, trimmed);
  if (found) return found;
  const [created] = await db
    .insert(albums)
    .values({ userId, artistId, name: trimmed })
    .onConflictDoNothing()
    .returning({ id: albums.id });
  if (created) return created.id;
  return (await findAlbum(userId, artistId, trimmed))!;
}

/** Resolve a song's artist/album metadata to entity ids (creating as needed). */
export async function resolveArtistAlbum(
  userId: string,
  artistName: string | null | undefined,
  albumName: string | null | undefined,
): Promise<{ artistId: string | null; albumId: string | null }> {
  const aName = artistName?.trim() || null;
  const alName = albumName?.trim() || null;
  if (!aName) return { artistId: null, albumId: null };
  const artistId = await upsertArtist(userId, aName);
  if (!alName) return { artistId, albumId: null };
  const albumId = await upsertAlbum(userId, artistId, alName);
  return { artistId, albumId };
}

async function findArtist(userId: string, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.userId, userId), sql`lower(${artists.name}) = lower(${name})`))
    .limit(1);
  return row?.id ?? null;
}

async function findAlbum(userId: string, artistId: string, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: albums.id })
    .from(albums)
    .where(
      and(
        eq(albums.userId, userId),
        eq(albums.artistId, artistId),
        sql`lower(${albums.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
