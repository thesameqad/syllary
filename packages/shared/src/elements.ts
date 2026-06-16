import { z } from "zod";

// Per-song "persisted elements" — reusable AI-generated reference subjects (a dog,
// headphones, a guitar) addressable like band members in prompts, but scoped to ONE
// song. The image is created via the cover-generation flow (generateCoverSchema /
// coverCommitSchema / coverGenerateResponseSchema in songs.ts are reused for it);
// the `elementIds` selected at generation time live in video.ts's createVideoSchema.

/** An element as returned to the client — name, last description, and a presigned
 *  reference image URL (null until one has been generated + saved). */
export const songElementSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
});
export type SongElement = z.infer<typeof songElementSchema>;
export const songElementListSchema = z.array(songElementSchema);

/** Create a per-song element (its image is generated + saved separately). */
export const createElementSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
});
export type CreateElement = z.infer<typeof createElementSchema>;

/** Rename / re-describe an element. */
export const updateElementSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
});
export type UpdateElement = z.infer<typeof updateElementSchema>;
