import type { Lyrics, LyricLine, LyricWord, ParsedLyricsText } from "@syllary/shared";
import { reconcileLyrics, structureLyrics } from "./openrouter.js";

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

type PendingWord = { text: string; start: number | null; end: number | null };

/** Interpolate timings for words that didn't match an original word, spreading
 *  each gap evenly between its known neighbours. */
function fillTimings(ws: PendingWord[], lineStart: number, lineEnd: number): void {
  const n = ws.length;
  let i = 0;
  while (i < n) {
    if (ws[i]!.start !== null) {
      i++;
      continue;
    }
    let j = i;
    while (j < n && ws[j]!.start === null) j++;
    const left = i > 0 ? ws[i - 1]!.end! : lineStart;
    const right = j < n ? ws[j]!.start! : lineEnd;
    const span = Math.max(right - left, 0);
    const count = j - i;
    const width = span / count;
    for (let k = 0; k < count; k++) {
      ws[i + k]!.start = left + width * k;
      ws[i + k]!.end = left + width * (k + 1);
    }
    i = j;
  }
}

/**
 * Align reformatted/edited lines back onto the original word timestamps using a
 * greedy, mismatch-tolerant token walk, so re-segmented/cleaned lines keep
 * accurate start/end times for karaoke sync. Every display token becomes a word
 * (preserving the edited spelling); words with no original match get an
 * interpolated timing so `words` always reconstructs `text`.
 */
export function alignLines(formatted: string[], words: LyricWord[]): LyricLine[] {
  const out: LyricLine[] = [];
  let cursor = 0;
  let prevEnd = words[0]?.start ?? 0;

  for (const text of formatted) {
    const tokens = text.split(/\s+/).filter(Boolean);
    const lineWords: PendingWord[] = tokens.map((t) => ({ text: t, start: null, end: null }));

    for (let k = 0; k < tokens.length; k++) {
      const token = normalize(tokens[k]!);
      if (!token) continue;
      const limit = Math.min(words.length, cursor + 8);
      for (let j = cursor; j < limit; j++) {
        if (normalize(words[j]!.text) === token) {
          lineWords[k]!.start = words[j]!.start;
          lineWords[k]!.end = words[j]!.end;
          cursor = j + 1;
          break;
        }
      }
    }

    const firstMatched = lineWords.find((w) => w.start !== null);
    const lastMatched = [...lineWords].reverse().find((w) => w.end !== null);
    const lineStart = firstMatched?.start ?? prevEnd;
    const lineEnd = lastMatched?.end ?? lineStart;

    fillTimings(lineWords, lineStart, lineEnd);

    const finalWords: LyricWord[] = lineWords.map((w) => ({
      text: w.text,
      start: w.start ?? lineStart,
      end: w.end ?? lineStart,
    }));

    const start = finalWords[0]?.start ?? lineStart;
    const end = finalWords.at(-1)?.end ?? lineEnd;
    prevEnd = end;
    out.push({ text, start, end, words: finalWords, section: null });
  }

  return out;
}

/**
 * Re-build a Lyrics object from user-edited text, re-aligning the new lines onto
 * the original word timestamps so karaoke sync survives edits. Falls back to the
 * old per-line timings (by position) when no word-level timing is available.
 */
export function realignFromText(old: Lyrics, parsed: ParsedLyricsText): Lyrics {
  const words = old.lines.flatMap((l) => l.words);
  const sectionByIndex = new Map(parsed.sections.map((s) => [s.index, s.label]));

  const base: LyricLine[] =
    words.length > 0
      ? alignLines(parsed.lines, words)
      : parsed.lines.map((text, i) => ({
          text,
          start: old.lines[i]?.start ?? 0,
          end: old.lines[i]?.end ?? 0,
          words: [],
          section: null,
        }));

  const lines = base.map((line, i) => ({ ...line, section: sectionByIndex.get(i) ?? null }));
  return { language: old.language, lines };
}

/** Extract the segment-level texts WhisperX produced (one entry per detected
 *  utterance). Used as input to the LLM reconciler. */
function segmentTexts(output: unknown): string[] {
  const o = (output ?? {}) as { segments?: { text?: string }[] };
  return (o.segments ?? [])
    .map((s) => (typeof s.text === "string" ? s.text.trim() : ""))
    .filter((s) => s.length > 0);
}

/** Union the word-level timestamps from multiple WhisperX outputs, sorted by
 *  start time. Used as the alignment pool so reconciled lines (which may have
 *  originated from any source) get accurate timings. */
function mergeWords(outputs: unknown[]): LyricWord[] {
  const all: LyricWord[] = [];
  for (const out of outputs) all.push(...mapWhisperx(out).lines.flatMap((l) => l.words));
  all.sort((a, b) => a.start - b.start);
  return all;
}

/** Single-source build path used by Fast and Normal modes: clean rough lines
 *  via the lightweight structuring LLM, then realign against the original word
 *  timestamps. */
async function buildLyricsSingle(output: unknown): Promise<Lyrics> {
  const raw = mapWhisperx(output);
  if (raw.lines.length === 0) return raw;
  const words = raw.lines.flatMap((l) => l.words);
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

/** Pro-mode build path: reconcile three independent WhisperX transcripts
 *  (vocals stem + mix at t=0 + mix at t=0.4) via a frontier LLM. Falls back to
 *  single-source structuring on the most-populated transcript if reconciliation
 *  fails (e.g. content-policy refusal). */
async function buildLyricsTriple(
  vocalsOutput: unknown,
  mixOutput: unknown,
  mixTOutput: unknown,
): Promise<Lyrics> {
  const vocalsRaw = mapWhisperx(vocalsOutput);
  const language = vocalsRaw.language ?? mapWhisperx(mixOutput).language ?? null;

  const reconciled = await reconcileLyrics({
    vocals: segmentTexts(vocalsOutput),
    mix: segmentTexts(mixOutput),
    mix_t04: segmentTexts(mixTOutput),
  });

  if (!reconciled) {
    const vocalsLines = vocalsRaw.lines;
    const mixLines = mapWhisperx(mixOutput).lines;
    const fallback = vocalsLines.length >= mixLines.length ? vocalsOutput : mixOutput;
    return buildLyricsSingle(fallback);
  }

  const words = mergeWords([vocalsOutput, mixOutput, mixTOutput]);
  if (words.length === 0) {
    const lines: LyricLine[] = reconciled.lines.map((text, i) => {
      const section = reconciled.sections.find((s) => s.index === i)?.label ?? null;
      return { text, start: 0, end: 0, words: [], section };
    });
    return { language, lines };
  }

  const sectionByIndex = new Map(reconciled.sections.map((s) => [s.index, s.label]));
  const aligned = alignLines(reconciled.lines, words).map((line, i) => ({
    ...line,
    section: sectionByIndex.get(i) ?? null,
  }));
  return { language, lines: aligned };
}

/**
 * Build canonical lyrics from the WhisperX outputs for a given mode. Fast and
 * Normal pass a single output; Pro passes [vocals, mix, mixT].
 */
export async function buildLyrics(outputs: unknown[]): Promise<Lyrics> {
  if (outputs.length === 3) return buildLyricsTriple(outputs[0], outputs[1], outputs[2]);
  if (outputs.length === 1) return buildLyricsSingle(outputs[0]);
  // Defensive: an empty / unexpected output array just yields empty lyrics.
  return { language: null, lines: [] };
}
