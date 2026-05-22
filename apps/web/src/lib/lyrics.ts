import type { LyricLine } from "@syllary/shared";

const flatten = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Whether a line's word-level array reconstructs its full text. Older saved
 * edits could drop words that didn't match the original transcription, leaving
 * `words` shorter than `text`; in that case callers should render `text` rather
 * than the per-word view so no word goes missing.
 */
export function wordsCoverText(line: LyricLine): boolean {
  if (line.words.length === 0) return false;
  return flatten(line.words.map((w) => w.text).join(" ")) === flatten(line.text);
}
