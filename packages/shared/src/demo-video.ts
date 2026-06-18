import { z } from "zod";
import { VIDEO_STYLE_PRESETS } from "./constants.js";

/** Request for the one-shot demo lyric-video tool. A fixed sample clip is
 *  rendered as a Slideshow using the visitor's chosen visual style + scene
 *  description. Either a preset `styleId` (from VIDEO_STYLE_PRESETS) or a
 *  free-text `customStyle` must be present. */
export const demoVideoRequestSchema = z
  .object({
    styleId: z.string().max(80).optional(),
    customStyle: z.string().trim().max(600).optional(),
    description: z.string().trim().max(600).optional().default(""),
  })
  .refine((v) => Boolean(v.styleId?.trim()) || Boolean(v.customStyle?.trim()), {
    message: "Pick a style or describe your own.",
  });
export type DemoVideoRequest = z.infer<typeof demoVideoRequestSchema>;

export const demoVideoResultSchema = z.object({ videoUrl: z.string().url() });
export type DemoVideoResult = z.infer<typeof demoVideoResultSchema>;

/** Resolve the request's style to the prompt string fed to the image model: a
 *  custom description wins; otherwise the chosen preset's prompt. Returns null
 *  when neither resolves (an unknown preset id), so the caller can 400. */
export function resolveDemoStyle(req: DemoVideoRequest): string | null {
  const custom = req.customStyle?.trim();
  if (custom) return custom;
  const preset = VIDEO_STYLE_PRESETS.find((p) => p.id === req.styleId);
  return preset ? preset.prompt : null;
}
