import { toDisplayLine, type Lyrics, type LyricLine } from "@syllary/shared";

export type LyricFormat = "lrc" | "lrc-enhanced" | "ttml" | "srt" | "vtt" | "txt" | "json";

export const LYRIC_FORMATS: {
  id: LyricFormat;
  label: string;
  extension: string;
  mime: string;
}[] = [
  { id: "lrc", label: ".lrc", extension: "lrc", mime: "text/plain" },
  { id: "lrc-enhanced", label: ".lrc enhanced", extension: "lrc", mime: "text/plain" },
  { id: "ttml", label: ".ttml", extension: "ttml", mime: "application/ttml+xml" },
  { id: "srt", label: ".srt", extension: "srt", mime: "text/plain" },
  { id: "vtt", label: ".vtt", extension: "vtt", mime: "text/vtt" },
  { id: "txt", label: ".txt", extension: "txt", mime: "text/plain" },
  { id: "json", label: ".json", extension: "json", mime: "application/json" },
];

function pad(n: number, len = 2): string {
  return Math.floor(n).toString().padStart(len, "0");
}

function lrcTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${pad(m)}:${pad(s)}.${pad(cs)}`;
}

function fullTime(seconds: number, msSep: "," | "."): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${msSep}${pad(ms, 3)}`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toTxt(lyrics: Lyrics): string {
  return lyrics.lines.map((l) => l.text).join("\n") + "\n";
}

export function toLrc(lyrics: Lyrics): string {
  return lyrics.lines.map((l) => `[${lrcTime(l.start)}]${toDisplayLine(l.text)}`).join("\n") + "\n";
}

export function toEnhancedLrc(lyrics: Lyrics): string {
  const line = (l: LyricLine): string => {
    if (l.words.length === 0) return `[${lrcTime(l.start)}]${toDisplayLine(l.text)}`;
    const last = l.words.length - 1;
    const inline = l.words
      .map((w, i) => `<${lrcTime(w.start)}>${i === last ? toDisplayLine(w.text) : w.text}`)
      .join(" ");
    return `[${lrcTime(l.start)}]${inline}`;
  };
  return lyrics.lines.map(line).join("\n") + "\n";
}

export function toSrt(lyrics: Lyrics): string {
  return (
    lyrics.lines
      .map(
        (l, i) =>
          `${i + 1}\n${fullTime(l.start, ",")} --> ${fullTime(l.end, ",")}\n${l.text}`,
      )
      .join("\n\n") + "\n"
  );
}

export function toVtt(lyrics: Lyrics): string {
  const cues = lyrics.lines
    .map((l) => `${fullTime(l.start, ".")} --> ${fullTime(l.end, ".")}\n${l.text}`)
    .join("\n\n");
  return `WEBVTT\n\n${cues}\n`;
}

export function toTtml(lyrics: Lyrics): string {
  const body = lyrics.lines
    .map((l) => {
      const begin = fullTime(l.start, ".");
      const end = fullTime(l.end, ".");
      if (l.words.length === 0) {
        return `      <p begin="${begin}" end="${end}">${escapeXml(toDisplayLine(l.text))}</p>`;
      }
      const last = l.words.length - 1;
      const spans = l.words
        .map((w, i) => {
          const text = i === last ? toDisplayLine(w.text) : w.text;
          return `<span begin="${fullTime(w.start, ".")}" end="${fullTime(w.end, ".")}">${escapeXml(text)}</span>`;
        })
        .join(" ");
      return `      <p begin="${begin}" end="${end}">${spans}</p>`;
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" xml:lang="${lyrics.language ?? "en"}">\n` +
    `  <body>\n    <div>\n${body}\n    </div>\n  </body>\n</tt>\n`
  );
}

export function toJson(lyrics: Lyrics): string {
  return JSON.stringify(lyrics, null, 2) + "\n";
}

export function generate(format: LyricFormat, lyrics: Lyrics): string {
  switch (format) {
    case "lrc":
      return toLrc(lyrics);
    case "lrc-enhanced":
      return toEnhancedLrc(lyrics);
    case "ttml":
      return toTtml(lyrics);
    case "srt":
      return toSrt(lyrics);
    case "vtt":
      return toVtt(lyrics);
    case "txt":
      return toTxt(lyrics);
    case "json":
      return toJson(lyrics);
  }
}
