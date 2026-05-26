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
async function structureLyricsOnce(rawLines: string[]): Promise<StructuredLyrics | null> {
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
    if (!res.ok) {
      console.warn(`[structureLyrics] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return null;
    }

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      console.warn("[structureLyrics] missing/non-string content", JSON.stringify(data).slice(0, 200));
      return null;
    }

    // Some models reply with a preamble or code fence before the JSON. Pull
    // the first JSON object out of the response and parse that, rather than
    // failing the whole call on a stray character.
    let parsed: { lines?: unknown; sections?: { index?: number; label?: string }[] };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) {
        console.warn(`[structureLyrics] non-JSON content (${(e as Error).message}):`, content.slice(0, 200));
        return null;
      }
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        console.warn(`[structureLyrics] extracted JSON still invalid (${(e2 as Error).message}):`, match[0].slice(0, 200));
        return null;
      }
    }
    if (!Array.isArray(parsed.lines)) {
      console.warn("[structureLyrics] parsed.lines is not an array", typeof parsed.lines, JSON.stringify(parsed).slice(0, 200));
      return null;
    }

    const lines = parsed.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
    if (lines.length === 0) {
      console.warn("[structureLyrics] no usable lines after filter");
      return null;
    }

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
  } catch (e) {
    console.warn("[structureLyrics] threw:", (e as Error).message);
    return null;
  }
}

/** Reformat rough transcript fragments into clean, naturally-segmented lyric
 *  lines + section labels. Retries up to two extra times with a short backoff
 *  so a transient OpenRouter blip / aborted-by-HMR fetch doesn't strand the
 *  song with unstructured lyrics. Returns null after all attempts fail. */
export async function structureLyrics(rawLines: string[]): Promise<StructuredLyrics | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await structureLyricsOnce(rawLines);
    if (result) return result;
    if (attempt < 2) {
      console.warn(`[structureLyrics] attempt ${attempt + 1} returned null, retrying…`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  return null;
}

const RECONCILE_PROMPT = `You are given two or three independent auto-transcriptions of the same song.
Each one may have ASR errors, missing lines, or extra hallucinations. Your job is to reconcile them into a single canonical lyric, then label the song's sections.

Strict rules:
- For each line, choose the version most consistent across sources, or — if they disagree — the one that makes the most grammatical/contextual sense as song lyrics.
- Repetition: song hooks/choruses repeat exactly. If two sources show a line repeated 4 times but one shows 2 times, output it 4 times. Use the highest count across sources.
- Cross-source spell-check: if one source has a word that fits the surrounding context better than a phonetically similar wrong word, prefer the contextually-correct one. Never invent words not present in any source.
- Drop standalone ASR hallucinations at start/end like "Thank you.", "Bye.", "Subscribe", "Black History Channel", a lone "you", that no source supports.
- Casing: sentence case. Profanity stays as written. Preserve numbers as written.
- Output natural lyric lines (one short phrase per line).
- Also label sections: "Intro", "Verse 1", "Verse 2", "Pre-Chorus", "Chorus", "Post-Chorus", "Bridge", "Refrain", "Outro". Detect choruses from repeated hooks; repeated passages reuse the same label.

Return ONLY JSON: { "lines": string[], "sections": [{ "index": number, "label": string }] }.
"sections": one entry per section at the line "index" where it begins (ascending). The first entry MUST be index 0.`;

/**
 * Reconcile multiple WhisperX transcripts into a single canonical lyric.
 * Sources are arbitrary string-array maps (e.g. { vocals, mix, mix_t04 }).
 * Returns null on any failure so the caller can fall back to the raw transcript.
 */
export async function reconcileLyrics(
  sources: Record<string, string[]>,
): Promise<StructuredLyrics | null> {
  // Filter out empty sources up front so we don't waste tokens on noise.
  const cleaned: Record<string, string[]> = {};
  for (const [key, lines] of Object.entries(sources)) {
    const trimmed = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    if (trimmed.length > 0) cleaned[key] = trimmed;
  }
  if (Object.keys(cleaned).length === 0) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_RECONCILE_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RECONCILE_PROMPT },
          { role: "user", content: JSON.stringify(cleaned) },
        ],
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as ChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") return null;

    // Some models reply with a preamble before the JSON; extract the first JSON block.
    const jsonText = (() => {
      try {
        JSON.parse(content);
        return content;
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        return match ? match[0] : null;
      }
    })();
    if (!jsonText) return null;

    const parsed = JSON.parse(jsonText) as {
      lines?: unknown;
      sections?: { index?: number; label?: string }[];
    };
    if (!Array.isArray(parsed.lines)) return null;

    const lines = parsed.lines
      .filter((l): l is string => typeof l === "string" && l.trim().length > 0)
      .map((l) => l.trim());
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
    return { lines, sections };
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
