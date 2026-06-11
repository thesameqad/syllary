import { z } from "zod";

// Band members ("characters") — reusable people/personas that belong to an
// artist (band) and carry one or more uploaded reference photos. Optionally
// selected at video-generation time so the AI scenes depict them, restyled to
// the chosen art direction. See plan: persistent characters.

/** One member photo as returned to the client — the R2 key plus a presigned URL. */
export const memberImageSchema = z.object({
  key: z.string(),
  url: z.string().url(),
});
export type MemberImage = z.infer<typeof memberImageSchema>;

export const bandMemberSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  artistId: z.string().uuid(),
  images: z.array(memberImageSchema).default([]),
});
export type BandMember = z.infer<typeof bandMemberSchema>;
export const bandMemberListSchema = z.array(bandMemberSchema);

/** Create a band member under an existing artist (band). */
export const createBandMemberSchema = z.object({
  artistId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
});
export type CreateBandMember = z.infer<typeof createBandMemberSchema>;

/** Edit a member: rename and/or reassign to another of the user's bands. */
export const updateBandMemberSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  artistId: z.string().uuid().optional(),
});
export type UpdateBandMember = z.infer<typeof updateBandMemberSchema>;

/** Remove one uploaded image from a member by its R2 key. */
export const removeMemberImageSchema = z.object({
  key: z.string().min(1).max(300),
});
export type RemoveMemberImage = z.infer<typeof removeMemberImageSchema>;
