import { z } from "zod";

export const lyricWordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});
export type LyricWord = z.infer<typeof lyricWordSchema>;

export const lyricLineSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
  words: z.array(lyricWordSchema).default([]),
  /** Section label for the line that starts a section, e.g. "Verse 1", "Chorus". */
  section: z.string().nullable().default(null),
});
export type LyricLine = z.infer<typeof lyricLineSchema>;

export const lyricsSchema = z.object({
  language: z.string().nullable().default(null),
  lines: z.array(lyricLineSchema),
});
export type Lyrics = z.infer<typeof lyricsSchema>;
