import { z } from "zod";

// Shared response shapes for the server-backed mini-tools. Request bodies are
// validated server-side; the client only needs the response schemas to parse.

/** Response of POST /api/tools/sections (the "find the chorus" tool): cleaned
 *  lyric lines + section labels by line index. Mirrors the engine's
 *  StructuredLyrics. */
export const toolSectionsResponseSchema = z.object({
  lines: z.array(z.string()),
  sections: z.array(z.object({ index: z.number(), label: z.string() })),
});
export type ToolSectionsResponse = z.infer<typeof toolSectionsResponseSchema>;
