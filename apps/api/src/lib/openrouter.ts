import type { SongInsights } from "@syllary/shared";
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

const INSIGHTS_PROMPT = `You are given the full lyrics of a song as an ordered array of lines.
Write a concise, factual "about this song" insight for a public lyrics page.
Return ONLY JSON: { "summary": string, "themes": string[], "mood": string }.

- "summary": ~60 words, neutral and descriptive. Describe what the song is about and its tone. Do NOT quote long passages or invent facts about the artist.
- "themes": 3 to 5 short lowercase theme tags (1-2 words each), e.g. "companionship", "heartbreak", "city nights".
- "mood": 1 to 3 mood words separated by " · ", e.g. "Tender · Introspective".`;

/** Generate an AI "about this song" insight (summary, themes, mood). Returns
 *  null on any failure so processing can continue without it. */
export async function summarizeSong(lines: string[]): Promise<SongInsights | null> {
  if (lines.length === 0) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: INSIGHTS_PROMPT },
          { role: "user", content: JSON.stringify({ lines }) },
        ],
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    const parsed = JSON.parse(content) as {
      summary?: unknown;
      themes?: unknown;
      mood?: unknown;
    };
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const mood = typeof parsed.mood === "string" ? parsed.mood.trim() : "";
    const themes = Array.isArray(parsed.themes)
      ? parsed.themes
          .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          .map((t) => t.trim().toLowerCase())
          .slice(0, 5)
      : [];
    if (!summary) return null;
    return { summary, themes, mood };
  } catch {
    return null;
  }
}
