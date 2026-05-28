/**
 * Probe several fal.ai speech-to-text models on the same audio file (uploads/4.mp3)
 * to find one that catches all 8 chorus reps AND returns per-word timestamps.
 *
 *   pnpm tsx --env-file=../../.env src/scripts/probe-fal-stt-models.ts
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const audioPath = resolve(process.argv[2] ?? "../../uploads/4.mp3");
const key = process.env.FAL_AI_KEY ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY;
if (!key) {
  console.error("FAL_AI_KEY missing from .env");
  process.exit(1);
}

console.log(`audio: ${audioPath}\n`);

// 1) Upload once, reuse the URL across all models.
console.log("[upload] preparing audio…");
const buf = await readFile(audioPath);
const initiateRes = await fetch("https://rest.alpha.fal.ai/storage/upload/initiate", {
  method: "POST",
  headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ file_name: basename(audioPath), content_type: "audio/mpeg" }),
});
if (!initiateRes.ok) {
  console.error(`initiate ${initiateRes.status}: ${await initiateRes.text()}`);
  process.exit(1);
}
const initiate = (await initiateRes.json()) as { upload_url: string; file_url: string };
const putRes = await fetch(initiate.upload_url, {
  method: "PUT",
  headers: { "Content-Type": "audio/mpeg" },
  body: buf,
});
if (!putRes.ok) {
  console.error(`PUT ${putRes.status}: ${await putRes.text()}`);
  process.exit(1);
}
console.log(`  uploaded → ${initiate.file_url}\n`);

const audioUrl = initiate.file_url;

type Variant = {
  label: string;
  path: string;
  body: Record<string, unknown>;
  // Extract: array of segments-like things to detect chorus reps,
  // and a flag indicating whether word-level timestamps are present.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inspect: (data: any) => { textConcat: string; hasWordTimestamps: boolean; details: string[] };
};

const variants: Variant[] = [
  {
    label: "fal-ai/speech-to-text",
    path: "fal-ai/speech-to-text",
    body: { audio_url: audioUrl, language: "en" },
    inspect: (d) => {
      const text = d?.text ?? "";
      const chunks = Array.isArray(d?.chunks) ? d.chunks : [];
      const hasWord = chunks.length > 0 && chunks[0]?.timestamp != null;
      const details = chunks
        .slice(0, 12)
        .map((c: { text?: string; timestamp?: [number, number] }) => {
          const ts = c.timestamp ? `${c.timestamp[0]?.toFixed(2)}-${c.timestamp[1]?.toFixed(2)}` : "?";
          return `${ts.padEnd(14)} ${JSON.stringify(c.text ?? "")}`;
        });
      return { textConcat: text, hasWordTimestamps: hasWord, details };
    },
  },
  {
    label: "fal-ai/speech-to-text/turbo",
    path: "fal-ai/speech-to-text/turbo",
    body: { audio_url: audioUrl, language: "en" },
    inspect: (d) => {
      const text = d?.text ?? "";
      const chunks = Array.isArray(d?.chunks) ? d.chunks : [];
      const hasWord = chunks.length > 0 && chunks[0]?.timestamp != null;
      const details = chunks.slice(0, 12).map((c: { text?: string; timestamp?: [number, number] }) => {
        const ts = c.timestamp ? `${c.timestamp[0]?.toFixed(2)}-${c.timestamp[1]?.toFixed(2)}` : "?";
        return `${ts.padEnd(14)} ${JSON.stringify(c.text ?? "")}`;
      });
      return { textConcat: text, hasWordTimestamps: hasWord, details };
    },
  },
  {
    label: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    path: "fal-ai/elevenlabs/speech-to-text/scribe-v2",
    body: { audio_url: audioUrl, language_code: "eng", diarize: false, timestamps_granularity: "word" },
    inspect: (d) => {
      // ElevenLabs Scribe shape: { text, words: [{ text, start, end, type }] }
      const text = d?.text ?? d?.transcript ?? "";
      const words = Array.isArray(d?.words) ? d.words : [];
      const hasWord = words.length > 0 && (words[0]?.start != null || words[0]?.timestamp != null);
      const details = words
        .slice(0, 12)
        .map((w: { text?: string; word?: string; start?: number; end?: number }) => {
          const t = (w.text ?? w.word ?? "").trim();
          const s = typeof w.start === "number" ? w.start.toFixed(2) : "?";
          const e = typeof w.end === "number" ? w.end.toFixed(2) : "?";
          return `${`${s}-${e}`.padEnd(14)} ${JSON.stringify(t)}`;
        });
      return { textConcat: text, hasWordTimestamps: hasWord, details };
    },
  },
  {
    label: "fal-ai/elevenlabs/speech-to-text",
    path: "fal-ai/elevenlabs/speech-to-text",
    body: { audio_url: audioUrl, language_code: "eng", diarize: false, timestamps_granularity: "word" },
    inspect: (d) => {
      const text = d?.text ?? d?.transcript ?? "";
      const words = Array.isArray(d?.words) ? d.words : [];
      const hasWord = words.length > 0 && (words[0]?.start != null || words[0]?.timestamp != null);
      const details = words
        .slice(0, 12)
        .map((w: { text?: string; word?: string; start?: number; end?: number }) => {
          const t = (w.text ?? w.word ?? "").trim();
          const s = typeof w.start === "number" ? w.start.toFixed(2) : "?";
          const e = typeof w.end === "number" ? w.end.toFixed(2) : "?";
          return `${`${s}-${e}`.padEnd(14)} ${JSON.stringify(t)}`;
        });
      return { textConcat: text, hasWordTimestamps: hasWord, details };
    },
  },
  {
    label: "fal-ai/cohere-transcribe",
    path: "fal-ai/cohere-transcribe",
    body: { audio_url: audioUrl, language: "en" },
    inspect: (d) => {
      const text = d?.text ?? d?.transcript ?? "";
      const words = Array.isArray(d?.words) ? d.words : Array.isArray(d?.chunks) ? d.chunks : [];
      const hasWord = words.length > 0 && (words[0]?.start != null || words[0]?.timestamp != null);
      const details = words.slice(0, 12).map((w: { text?: string; word?: string; start?: number; end?: number; timestamp?: [number, number] }) => {
        const t = (w.text ?? w.word ?? "").trim();
        const ts = w.timestamp
          ? `${w.timestamp[0]?.toFixed(2)}-${w.timestamp[1]?.toFixed(2)}`
          : `${typeof w.start === "number" ? w.start.toFixed(2) : "?"}-${typeof w.end === "number" ? w.end.toFixed(2) : "?"}`;
        return `${ts.padEnd(14)} ${JSON.stringify(t)}`;
      });
      return { textConcat: text, hasWordTimestamps: hasWord, details };
    },
  },
];

const re = /what\s*is\s*wrong\s*with\s*you/gi;
const scoreboard: { label: string; chorus: number; wordTs: boolean; wallMs: number; ok: boolean; note?: string }[] = [];

for (const v of variants) {
  console.log(`=== ${v.label} ===`);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(`https://fal.run/${v.path}`, {
      method: "POST",
      headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(v.body),
    });
  } catch (e) {
    const m = (e as Error).message;
    console.error("  fetch failed:", m);
    scoreboard.push({ label: v.label, chorus: 0, wordTs: false, wallMs: Date.now() - t0, ok: false, note: m });
    continue;
  }
  const wallMs = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text();
    console.error(`  HTTP ${res.status}: ${text.slice(0, 200)}`);
    scoreboard.push({ label: v.label, chorus: 0, wordTs: false, wallMs, ok: false, note: `HTTP ${res.status}` });
    console.log();
    continue;
  }
  const data = await res.json();
  const insp = v.inspect(data);
  const chorus = (insp.textConcat.match(re) ?? []).length;
  console.log(`  wall: ${wallMs}ms  chorus reps in text: ${chorus}/8  word timestamps: ${insp.hasWordTimestamps}`);
  console.log(`  full text: ${JSON.stringify(insp.textConcat.slice(0, 200))}`);
  for (const d of insp.details) console.log(`    ${d}`);
  scoreboard.push({ label: v.label, chorus, wordTs: insp.hasWordTimestamps, wallMs, ok: true });
  console.log();
}

console.log("=== Scoreboard ===");
console.log("(truth: 8 chorus reps in 4.mp3)");
console.log("");
for (const s of scoreboard) {
  const mark = !s.ok
    ? `❌ ${s.note}`
    : s.chorus >= 8 && s.wordTs
      ? "✅ FULL + word ts"
      : s.chorus >= 8
        ? "⚠ full text, no word ts"
        : s.wordTs
          ? `⚠ ${s.chorus}/8 + word ts`
          : `⚠ ${s.chorus}/8, no word ts`;
  console.log(
    `  ${s.label.padEnd(46)}  wall=${String(s.wallMs).padStart(5)}ms  ${mark}`,
  );
}
process.exit(0);
