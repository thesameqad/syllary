import type { Lyrics } from "./lyrics.js";

export type ParsedLyricsText = {
  lines: string[];
  sections: { index: number; label: string }[];
};

/** "Verse1" → "Verse 1", "pre-chorus" → "Pre-Chorus". */
function normalizeSectionLabel(raw: string): string {
  return raw
    .trim()
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse a user-edited lyrics document into lines + section markers.
 * Lines wrapped in square brackets (e.g. `[Verse 1]`) become section labels
 * attached to the lyric line that follows. Blank lines are ignored.
 */
export function parseLyricsText(text: string): ParsedLyricsText {
  const lines: string[] = [];
  const sections: { index: number; label: string }[] = [];
  let pending: string | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const marker = trimmed.match(/^\[(.+)\]$/);
    if (marker) {
      pending = normalizeSectionLabel(marker[1]!);
      continue;
    }

    if (pending !== null) {
      sections.push({ index: lines.length, label: pending });
      pending = null;
    }
    lines.push(trimmed);
  }

  return { lines, sections };
}

/** Serialize lyrics into the editable document format `parseLyricsText` reads. */
export function lyricsToText(lyrics: Lyrics): string {
  const out: string[] = [];
  for (const line of lyrics.lines) {
    if (line.section) {
      if (out.length > 0) out.push("");
      out.push(`[${line.section}]`);
    }
    out.push(line.text);
  }
  return out.join("\n");
}
