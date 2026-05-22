import { parseBlob } from "music-metadata";
import { getAudioDuration } from "./audio";

export type AudioMeta = {
  durationSeconds: number | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  cover: { blob: Blob; contentType: string } | null;
};

/** Extract duration, tags, and embedded cover art from an audio file. */
export async function extractMetadata(file: File): Promise<AudioMeta> {
  let durationSeconds: number | null = null;
  let title: string | null = null;
  let artist: string | null = null;
  let album: string | null = null;
  let year: number | null = null;
  let cover: AudioMeta["cover"] = null;

  try {
    const mm = await parseBlob(file, { duration: true });
    durationSeconds = typeof mm.format.duration === "number" ? mm.format.duration : null;
    title = mm.common.title ?? null;
    artist = mm.common.artist ?? mm.common.albumartist ?? null;
    album = mm.common.album ?? null;
    year = typeof mm.common.year === "number" ? mm.common.year : null;
    const pic = mm.common.picture?.[0];
    if (pic) {
      const data = new Uint8Array(pic.data);
      cover = { blob: new Blob([data], { type: pic.format }), contentType: pic.format };
    }
  } catch {
    // ignore — fall back below
  }

  if (durationSeconds == null) {
    durationSeconds = await getAudioDuration(file);
  }

  return { durationSeconds, title, artist, album, year, cover };
}
