import { lyricsSchema, type Lyrics, type LyricLine, type LyricWord } from "@syllary/shared";
import type { LyricFormat } from "./generate.js";

// ---------------------------------------------------------------------------
// Parsers: turn an existing lyrics file (any supported INPUT format) into the
// internal Lyrics model, so the converter can re-emit it via generate().
//
// Constraints (SYLLARY.md §4 + converter-realism rule):
//   - JSON is NOT a supported input format (output only).
//   - .ass / .pdf are never supported in any direction.
// ---------------------------------------------------------------------------

/** Formats that can be parsed as converter INPUT — every LyricFormat except json. */
export type InputFormat = Exclude<LyricFormat, "json">;

export const INPUT_FORMATS: { id: InputFormat; label: string }[] = [
  { id: "lrc", label: ".lrc" },
  { id: "lrc-enhanced", label: ".lrc (enhanced)" },
  { id: "ttml", label: ".ttml" },
  { id: "srt", label: ".srt" },
  { id: "vtt", label: ".vtt" },
  { id: "txt", label: ".txt" },
];

/** Fallback duration (seconds) for the final line when an end can't be inferred. */
const TRAILING_LINE_SECONDS = 4;

class ParseError extends Error {}

function fail(message: string): never {
  throw new ParseError(message);
}

/** Parse `mm:ss.xx`, `mm:ss.xxx`, `hh:mm:ss.xxx` or `hh:mm:ss,xxx` to seconds. */
function parseClock(raw: string): number | null {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const hours = m[1] ? Number(m[1]) : 0;
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const frac = m[4] ? Number(m[4].padEnd(3, "0")) / 1000 : 0;
  return hours * 3600 + minutes * 60 + seconds + frac;
}

/** LRC timestamps are `mm:ss.xx`, but some files use `:` as the fractional
 *  separator (`mm:ss:xx`). Normalize that to a dot before parsing. */
function parseLrcClock(raw: string): number | null {
  return parseClock(raw.replace(/^(\d{1,2}:\d{1,2}):(\d{1,3})$/, "$1.$2"));
}

/** Sort lines by start time and fill any missing `end` from the next line's start. */
function finalizeLines(lines: LyricLine[]): LyricLine[] {
  const sorted = [...lines].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length; i++) {
    const line = sorted[i]!;
    if (line.end <= line.start) {
      const next = sorted[i + 1];
      line.end = next ? next.start : line.start + TRAILING_LINE_SECONDS;
    }
    // Fill word ends the same way, bounded by the line end.
    for (let w = 0; w < line.words.length; w++) {
      const word = line.words[w]!;
      if (word.end <= word.start) {
        const nextWord = line.words[w + 1];
        word.end = nextWord ? nextWord.start : line.end;
      }
    }
  }
  return sorted;
}

function makeLyrics(lines: LyricLine[]): Lyrics {
  return lyricsSchema.parse({ language: null, lines: finalizeLines(lines) });
}

// ---------------------------------------------------------------------------
// LRC (classic + enhanced)
// ---------------------------------------------------------------------------

export function parseLrc(text: string): Lyrics {
  const lines: LyricLine[] = [];
  let offsetMs = 0;

  // First pass: pick up an [offset:±ms] tag (applies to every timestamp).
  const offsetMatch = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offsetMatch) offsetMs = Number(offsetMatch[1]);

  const lineTagRe = /\[(\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?)\]/g;
  const wordTagRe = /<(\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?)>/g;

  for (const rawLine of text.split(/\r?\n/)) {
    // Skip metadata tags like [ti:], [ar:], [offset:], [length:] etc.
    if (/^\s*\[[a-z]+:/i.test(rawLine)) continue;

    lineTagRe.lastIndex = 0;
    const stamps: number[] = [];
    let lastTagEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = lineTagRe.exec(rawLine))) {
      const t = parseLrcClock(m[1]!);
      if (t != null) stamps.push(Math.max(0, t - offsetMs / 1000));
      lastTagEnd = lineTagRe.lastIndex;
    }
    if (stamps.length === 0) continue;

    const remainder = rawLine.slice(lastTagEnd);
    const words: LyricWord[] = [];
    let plain = remainder;

    // Enhanced LRC: inline <mm:ss.xx> word timestamps.
    if (wordTagRe.test(remainder)) {
      wordTagRe.lastIndex = 0;
      plain = "";
      let cursor = 0;
      let pendingStart: number | null = null;
      let pendingText = "";
      const flush = () => {
        const txt = pendingText.trim();
        if (pendingStart != null && txt) {
          words.push({ text: txt, start: pendingStart, end: pendingStart });
          plain += (plain ? " " : "") + txt;
        }
        pendingText = "";
      };
      let wm: RegExpExecArray | null;
      while ((wm = wordTagRe.exec(remainder))) {
        pendingText += remainder.slice(cursor, wm.index);
        flush();
        const wt = parseLrcClock(wm[1]!);
        pendingStart = wt == null ? null : Math.max(0, wt - offsetMs / 1000);
        cursor = wordTagRe.lastIndex;
      }
      pendingText += remainder.slice(cursor);
      flush();
    }

    const cleanText = plain.trim();
    if (!cleanText) continue;
    for (const start of stamps) {
      lines.push({
        text: cleanText,
        start,
        end: start,
        words: words.map((w) => ({ ...w })),
        section: null,
      });
    }
  }

  if (lines.length === 0) fail("No timestamped lyric lines found in the .lrc input.");
  return makeLyrics(lines);
}

// ---------------------------------------------------------------------------
// SRT / VTT (cue-based)
// ---------------------------------------------------------------------------

function parseCues(text: string, sep: "," | "."): Lyrics {
  const lines: LyricLine[] = [];
  const arrowRe = new RegExp(
    `(\\d{1,2}:\\d{1,2}(?::\\d{1,2})?[${sep === "," ? "," : "."}]\\d{1,3})\\s*-->\\s*(\\d{1,2}:\\d{1,2}(?::\\d{1,2})?[${sep === "," ? "," : "."}]\\d{1,3})`,
  );

  const blocks = text.replace(/^WEBVTT.*$/m, "").split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const rows = block.split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
    if (rows.length === 0) continue;
    const arrowIdx = rows.findIndex((r) => arrowRe.test(r));
    if (arrowIdx === -1) continue;
    const m = rows[arrowIdx]!.match(arrowRe);
    if (!m) continue;
    const start = parseClock(m[1]!);
    const end = parseClock(m[2]!);
    if (start == null) continue;
    const body = rows.slice(arrowIdx + 1).join(" ").trim();
    if (!body) continue;
    lines.push({ text: body, start, end: end ?? start, words: [], section: null });
  }
  if (lines.length === 0) fail("No cues found in the subtitle input.");
  return makeLyrics(lines);
}

export function parseSrt(text: string): Lyrics {
  return parseCues(text, ",");
}

export function parseVtt(text: string): Lyrics {
  return parseCues(text, ".");
}

// ---------------------------------------------------------------------------
// TTML
// ---------------------------------------------------------------------------

function ttmlTime(raw: string): number | null {
  const offset = raw.trim().match(/^([\d.]+)s$/);
  if (offset) return Number(offset[1]);
  return parseClock(raw);
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function parseTtml(text: string): Lyrics {
  const lines: LyricLine[] = [];
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(text))) {
    const attrs = pm[1]!;
    const inner = pm[2]!;
    const begin = attrs.match(/\bbegin\s*=\s*"([^"]*)"/i);
    const end = attrs.match(/\bend\s*=\s*"([^"]*)"/i);
    const start = begin ? ttmlTime(begin[1]!) : null;
    if (start == null) continue;
    const lineEnd = end ? ttmlTime(end[1]!) : null;

    const words: LyricWord[] = [];
    const spanRe = /<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = spanRe.exec(inner))) {
      const sAttrs = sm[1]!;
      const sBegin = sAttrs.match(/\bbegin\s*=\s*"([^"]*)"/i);
      const sStart = sBegin ? ttmlTime(sBegin[1]!) : null;
      const sEnd = sAttrs.match(/\bend\s*=\s*"([^"]*)"/i);
      const wText = decodeXml(sm[2]!.replace(/<[^>]+>/g, "")).trim();
      if (sStart != null && wText) {
        words.push({ text: wText, start: sStart, end: sEnd ? (ttmlTime(sEnd[1]!) ?? sStart) : sStart });
      }
    }

    const plain = decodeXml(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    if (!plain) continue;
    lines.push({ text: plain, start, end: lineEnd ?? start, words, section: null });
  }
  if (lines.length === 0) fail("No <p> lines found in the .ttml input.");
  return makeLyrics(lines);
}

// ---------------------------------------------------------------------------
// Plain text (no timing)
// ---------------------------------------------------------------------------

export function parseTxt(text: string): Lyrics {
  const lines: LyricLine[] = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => ({ text: t, start: 0, end: 0, words: [], section: null }));
  if (lines.length === 0) fail("The text input is empty.");
  // No timestamps to sort/infer; return as-is with zeroed timing.
  return lyricsSchema.parse({ language: null, lines });
}

// ---------------------------------------------------------------------------
// Detection + dispatch
// ---------------------------------------------------------------------------

/** Best-effort format sniff. Returns null when nothing matches (caller can
 *  default to txt or surface an error). */
export function detectFormat(text: string): InputFormat | null {
  const head = text.trimStart();
  if (/^WEBVTT/.test(head)) return "vtt";
  if (/<tt\b|xmlns="http:\/\/www\.w3\.org\/ns\/ttml"/i.test(text)) return "ttml";
  if (/\d{1,2}:\d{2}:\d{2},\d{3}\s*-->/.test(text)) return "srt";
  if (/\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]/.test(text)) {
    return /<\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?>/.test(text) ? "lrc-enhanced" : "lrc";
  }
  return null;
}

export function parse(format: InputFormat, text: string): Lyrics {
  switch (format) {
    case "lrc":
    case "lrc-enhanced":
      return parseLrc(text);
    case "srt":
      return parseSrt(text);
    case "vtt":
      return parseVtt(text);
    case "ttml":
      return parseTtml(text);
    case "txt":
      return parseTxt(text);
  }
}
