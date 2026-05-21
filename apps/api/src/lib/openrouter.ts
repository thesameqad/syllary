import { env } from "../env.js";

const SYSTEM_PROMPT = `You are given a rough auto-transcription of a song as an ordered array of text fragments.
Reformat it into clean, natural lyric lines and label the song's sections.
Return ONLY JSON: { "lines": string[], "sections": [{ "index": number, "label": string }] }.

"lines":
- The lyrics split into natural singing lines (one short phrase per line).
- Fix spelling, capitalization, and punctuation. Use sentence case (never ALL CAPS).
- Preserve the original words and their order. Do NOT invent, translate, or paraphrase. You may split run-on fragments into several lines and join fragments that belong on one line.

"sections":
- Divide the whole song into sections; one entry per section at the line "index" where it begins (ascending). The first entry MUST be index 0.
- "label": "Intro", "Verse 1", "Verse 2", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Refrain", "Outro".
- Detect the chorus from repeated lines/hooks; repeated passages reuse the same label ("Chorus").`;

type ChatResponse = { choices?: { message?: { content?: string } }[] };

export type StructuredLyrics = {
  lines: string[];
  sections: { index: number; label: string }[];
};

/** Reformat rough transcript fragments into clean, naturally-segmented lyric
 *  lines + section labels. Returns null on any failure so the caller can fall
 *  back to the raw transcription. */
export async function structureLyrics(rawLines: string[]): Promise<StructuredLyrics | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ fragments: rawLines }) },
        ],
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content) as {
      lines?: unknown;
      sections?: { index?: number; label?: string }[];
    };
    if (!Array.isArray(parsed.lines)) return null;

    const lines = parsed.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
    if (lines.length === 0) return null;

    const sections: StructuredLyrics["sections"] = [];
    for (const s of parsed.sections ?? []) {
      if (
        typeof s?.index === "number" &&
        s.index >= 0 &&
        s.index < lines.length &&
        typeof s.label === "string" &&
        s.label.trim().length > 0
      ) {
        sections.push({ index: s.index, label: s.label.trim() });
      }
    }

    return { lines: lines.map((l) => l.trim()), sections };
  } catch {
    return null;
  }
}
