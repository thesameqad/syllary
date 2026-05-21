// Illustrative sample data for the landing "live preview" card only.
// The canonical, validated format generators live in packages/lyrics.

type DemoLine = { start: number; end: number; text: string };

export const DEMO_TRACK = {
  file: "midnight_demo.mp3",
  duration: "3:42",
  processedIn: "38s",
  lines: [
    { start: 14.0, end: 18.0, text: "Streetlights flicker on the avenue" },
    { start: 18.2, end: 22.3, text: "I keep walking till the morning's through" },
    { start: 22.5, end: 26.4, text: "Counting every breath I take" },
  ] satisfies DemoLine[],
};

export type DemoFormat = "lrc" | "ttml" | "srt" | "vtt" | "txt";

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, "0");
}

function clock(seconds: number, sep: "," | "." = "."): string {
  const ms = Math.round((seconds % 1) * 1000);
  const s = Math.floor(seconds) % 60;
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms, 3)}`;
}

function lrcStamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `[${pad(m)}:${pad(s)}.${pad(cs)}]`;
}

const BUILDERS: Record<DemoFormat, () => string> = {
  txt: () => DEMO_TRACK.lines.map((l) => l.text).join("\n") + "\n",
  lrc: () =>
    DEMO_TRACK.lines.map((l) => `${lrcStamp(l.start)}${l.text}`).join("\n") + "\n",
  srt: () =>
    DEMO_TRACK.lines
      .map(
        (l, i) =>
          `${i + 1}\n${clock(l.start, ",")} --> ${clock(l.end, ",")}\n${l.text}\n`,
      )
      .join("\n"),
  vtt: () =>
    "WEBVTT\n\n" +
    DEMO_TRACK.lines
      .map((l) => `${clock(l.start)} --> ${clock(l.end)}\n${l.text}\n`)
      .join("\n"),
  ttml: () =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<tt xmlns="http://www.w3.org/ns/ttml">\n  <body>\n    <div>\n` +
    DEMO_TRACK.lines
      .map((l) => `      <p begin="${clock(l.start)}" end="${clock(l.end)}">${l.text}</p>`)
      .join("\n") +
    `\n    </div>\n  </body>\n</tt>\n`,
};

const MIME: Record<DemoFormat, string> = {
  txt: "text/plain",
  lrc: "text/plain",
  srt: "text/plain",
  vtt: "text/vtt",
  ttml: "application/ttml+xml",
};

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSample(format: DemoFormat) {
  triggerDownload(`syllary-demo.${format}`, BUILDERS[format](), MIME[format]);
}

export function downloadAllSamples() {
  const formats: DemoFormat[] = ["lrc", "ttml", "srt", "vtt", "txt"];
  const bundle = formats
    .map((f) => `===== syllary-demo.${f} =====\n${BUILDERS[f]()}`)
    .join("\n");
  triggerDownload("syllary-demo-formats.txt", bundle, "text/plain");
}
