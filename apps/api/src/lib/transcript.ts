import type { Lyrics, LyricLine, LyricWord } from "@syllary/shared";
import { structureLyrics } from "./openrouter.js";

type WhisperxWord = { word?: string; text?: string; start?: number; end?: number };
type WhisperxSegment = { start?: number; end?: number; text?: string; words?: WhisperxWord[] };
type WhisperxOutput = {
  segments?: WhisperxSegment[];
  detected_language?: string;
  language?: string;
};

// Pre-LLM segmentation: split long merged segments into rough lines by word gap.
const LINE_GAP_SECONDS = 1.0;
const MAX_WORDS_PER_LINE = 16;
const MAX_LINE_SECONDS = 12;

function makeLine(words: LyricWord[]): LyricLine {
  const text = words
    .map((w) => w.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();
  return { text, start: words[0]?.start ?? 0, end: words.at(-1)?.end ?? 0, words, section: null };
}

/** Map raw WhisperX output to rough lines (word timestamps preserved). */
export function mapWhisperx(output: unknown): Lyrics {
  const o = (output ?? {}) as WhisperxOutput;
  const segments = Array.isArray(o.segments) ? o.segments : [];
  const lines: LyricLine[] = [];

  for (const seg of segments) {
    const words: LyricWord[] = (seg.words ?? [])
      .map((w) => ({
        text: (w.word ?? w.text ?? "").trim(),
        start: w.start ?? seg.start ?? 0,
        end: w.end ?? seg.end ?? 0,
      }))
      .filter((w) => w.text.length > 0);

    if (words.length === 0) {
      const text = (seg.text ?? "").trim();
      if (text) lines.push({ text, start: seg.start ?? 0, end: seg.end ?? 0, words: [], section: null });
      continue;
    }

    let current: LyricWord[] = [];
    for (const word of words) {
      if (current.length === 0) {
        current.push(word);
        continue;
      }
      const prev = current[current.length - 1]!;
      const gap = word.start - prev.end;
      const lineDuration = word.end - current[0]!.start;
      if (gap > LINE_GAP_SECONDS || current.length >= MAX_WORDS_PER_LINE || lineDuration > MAX_LINE_SECONDS) {
        lines.push(makeLine(current));
        current = [word];
      } else {
        current.push(word);
      }
    }
    if (current.length > 0) lines.push(makeLine(current));
  }

  return { language: o.detected_language ?? o.language ?? null, lines };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Align LLM-reformatted lines back onto the original word timestamps using a
 * greedy, mismatch-tolerant token walk, so re-segmented/cleaned lines keep
 * accurate start/end times for karaoke sync.
 */
function alignLines(formatted: string[], words: LyricWord[]): LyricLine[] {
  const out: LyricLine[] = [];
  let cursor = 0;
  let prevEnd = words[0]?.start ?? 0;

  for (const text of formatted) {
    const tokens = text.split(/\s+/).map(normalize).filter(Boolean);
    const matched: LyricWord[] = [];

    for (const token of tokens) {
      const limit = Math.min(words.length, cursor + 8);
      for (let j = cursor; j < limit; j++) {
        if (normalize(words[j]!.text) === token) {
          matched.push(words[j]!);
          cursor = j + 1;
          break;
        }
      }
    }

    const start = matched[0]?.start ?? prevEnd;
    const end = matched.at(-1)?.end ?? start;
    if (matched.length > 0) prevEnd = end;
    out.push({ text, start, end, words: matched, section: null });
  }

  return out;
}

export async function buildLyrics(output: unknown): Promise<Lyrics> {
  const raw = mapWhisperx(output);
  if (raw.lines.length === 0) return raw;

  const words = raw.lines.flatMap((l) => l.words);
  // No word-level timing → can't realign; keep the rough lines.
  if (words.length === 0) return raw;

  const structured = await structureLyrics(raw.lines.map((l) => l.text));
  if (!structured) return raw;

  const sectionByIndex = new Map(structured.sections.map((s) => [s.index, s.label]));
  const aligned = alignLines(structured.lines, words).map((line, i) => ({
    ...line,
    section: sectionByIndex.get(i) ?? null,
  }));

  return { language: raw.language, lines: aligned };
}
