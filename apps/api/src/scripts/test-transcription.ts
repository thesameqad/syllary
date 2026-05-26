/**
 * E2E lyric-pipeline test: compares vocals-only, mix-only, and merged
 * (gap-fill) transcription paths against ground-truth lyrics, word-level.
 *
 * Usage:
 *   tsx apps/api/src/scripts/test-transcription.ts          # song 3 only
 *   tsx apps/api/src/scripts/test-transcription.ts 1 2 3    # specific songs
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import Replicate from "replicate";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
if (!REPLICATE_API_TOKEN) throw new Error("REPLICATE_API_TOKEN missing");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");

const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });
const UPLOADS = resolve(__dirname, "../../../../uploads");

type WhisperxWord = { word?: string; text?: string; start?: number; end?: number };
type WhisperxSegment = { start?: number; end?: number; text?: string; words?: WhisperxWord[] };
type WhisperxOutput = { segments?: WhisperxSegment[]; detected_language?: string };

async function uploadToReplicate(path: string): Promise<string> {
  const buf = await readFile(path);
  const blob = new Blob([buf], { type: "audio/mpeg" });
  const file = await replicate.files.create(blob);
  const url = (file as { urls?: { get?: string } }).urls?.get;
  if (!url) throw new Error("file upload returned no URL");
  return url;
}

async function createPredictionWithRetry(input: {
  version: string;
  input: Record<string, unknown>;
}): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await replicate.predictions.create(input);
    } catch (e) {
      const err = e as {
        response?: { status?: number; headers?: { get?: (k: string) => string | null } };
      };
      if (err.response?.status === 429) {
        const retryAfter = Number(err.response.headers?.get?.("retry-after") ?? 15);
        console.log(`  rate-limited, waiting ${retryAfter + 2}s...`);
        await new Promise((r) => setTimeout(r, (retryAfter + 2) * 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("createPrediction: exhausted retries");
}

async function modelVersion(owner: string, name: string): Promise<string> {
  const m = await replicate.models.get(owner, name);
  const v = m.latest_version?.id;
  if (!v) throw new Error(`no version for ${owner}/${name}`);
  return v;
}

async function waitForPrediction(id: string, label: string): Promise<unknown> {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const p = await replicate.predictions.get(id);
    if (p.status === "succeeded") return p.output;
    if (p.status === "failed" || p.status === "canceled") {
      throw new Error(`${label} ${p.status}: ${String(p.error)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`${label} timed out`);
}

async function runDemucs(audioUrl: string): Promise<string> {
  const version = await modelVersion("ryan5453", "demucs");
  const pred = await createPredictionWithRetry({
    version,
    input: { audio: audioUrl, stem: "vocals", model: "htdemucs_ft", shifts: 2 },
  });
  const out = (await waitForPrediction(pred.id, "demucs")) as { vocals?: string };
  if (!out.vocals) throw new Error("demucs: no vocals url");
  return out.vocals;
}

async function runWhisperX(
  audioUrl: string,
  label: string,
  opts: { temperature?: number } = {},
): Promise<WhisperxOutput> {
  const version = await modelVersion("victor-upmeet", "whisperx-a40-large");
  const pred = await createPredictionWithRetry({
    version,
    input: {
      audio_file: audioUrl,
      align_output: true,
      // Aggressive VAD so we don't miss quiet/screamed sections.
      vad_onset: 0.05,
      vad_offset: 0.05,
      language: "en",
      temperature: opts.temperature ?? 0,
    },
  });
  console.log(`  whisperx (${label}) started: ${pred.id}`);
  return (await waitForPrediction(pred.id, `whisperx-${label}`)) as WhisperxOutput;
}

function rawTranscript(out: WhisperxOutput): string {
  const parts: string[] = [];
  for (const seg of out.segments ?? []) {
    if (seg.words?.length) {
      for (const w of seg.words) parts.push((w.word ?? w.text ?? "").trim());
    } else if (seg.text) {
      parts.push(seg.text.trim());
    }
  }
  return parts.filter(Boolean).join(" ");
}

/** Build a sorted list of (start, end, text) from a whisperx output. */
type TimedSeg = { start: number; end: number; text: string; source: "vocals" | "mix" };
function segmentsOf(out: WhisperxOutput, source: "vocals" | "mix"): TimedSeg[] {
  const segs: TimedSeg[] = [];
  for (const seg of out.segments ?? []) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    segs.push({
      start: seg.start ?? 0,
      end: seg.end ?? (seg.start ?? 0) + 1,
      text,
      source,
    });
  }
  segs.sort((a, b) => a.start - b.start);
  return segs;
}

/** Merge vocals + mix segments by timeline. Vocals wins on overlap; mix fills
 *  gaps where vocals has no segment covering that window. */
function mergeSegments(vocals: TimedSeg[], mix: TimedSeg[]): TimedSeg[] {
  const result: TimedSeg[] = [...vocals];
  // For each mix segment, if it doesn't overlap any vocals segment by >40% of
  // its own duration, accept it as a gap-fill.
  const OVERLAP_THRESHOLD = 0.4;
  for (const m of mix) {
    const mDur = Math.max(m.end - m.start, 0.001);
    let bestOverlap = 0;
    for (const v of vocals) {
      const overlap = Math.max(0, Math.min(m.end, v.end) - Math.max(m.start, v.start));
      if (overlap > bestOverlap) bestOverlap = overlap;
    }
    if (bestOverlap / mDur < OVERLAP_THRESHOLD) {
      result.push(m);
    }
  }
  result.sort((a, b) => a.start - b.start);
  return result;
}

async function llmStructure(rawLines: string[]): Promise<string[]> {
  const SYSTEM = `You are given a rough auto-transcription of a song as an ordered array of text fragments.
Reformat it into clean, natural lyric lines. Return ONLY JSON: { "lines": string[] }.
Fix spelling/casing/punctuation. Preserve original words and order. Do not invent or paraphrase. If a fragment looks like a duplicate of an adjacent one (same line picked up by both vocal isolation and the full mix), keep only one copy.`;
  return llmCall(SYSTEM, { fragments: rawLines });
}

async function llmReconcile(sources: Record<string, string[]>, model?: string): Promise<string[]> {
  const SYSTEM = `You are given two or three independent auto-transcriptions of the same song.
Each one may have ASR errors, missing lines, or extra hallucinations. Your job is to reconcile them into a single canonical lyric.

Strict rules:
- For each line, choose the version most consistent across sources, or — if they disagree — the one that makes the most grammatical/contextual sense as song lyrics.
- Repetition: song hooks/choruses repeat exactly. If two sources show a line repeated 4 times but one shows it 2 times, output it 4 times. Count repetitions across sources and use the highest count.
- Cross-source spell-check: if one source has a near-rhyme word that fits the surrounding context better (e.g. "rage" after "ladder"; "vow" after "made a"; "Mission" with "Sixth and"), prefer it over a phonetically similar but contextually wrong word ("rain", "bite", "admission").
- Drop standalone ASR hallucinations like "Thank you.", "Bye.", "Subscribe", "Black History Channel", "you", isolated at the very start or end with no support across both sources.
- Do NOT invent words or paraphrase. Every word in your output must appear in at least one source for its line.
- Casing: sentence case. Profanity stays. Preserve numbers as written.
- Output natural lyric lines (one phrase per line).

Return ONLY JSON: { "lines": string[] }.`;
  return llmCall(SYSTEM, sources, model);
}

async function llmCall(systemPrompt: string, payload: unknown, modelOverride?: string): Promise<string[]> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelOverride ?? OPENROUTER_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!res.ok) {
    console.warn(`  llm call (${modelOverride ?? OPENROUTER_MODEL}) failed: ${res.status}`);
    return [];
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(content) as { lines?: string[] };
    return parsed.lines ?? [];
  } catch {
    // Some models reply with prose; try to extract a JSON block.
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return (JSON.parse(match[0]) as { lines?: string[] }).lines ?? [];
      } catch {
        /* fall through */
      }
    }
    console.warn(`  llm call (${modelOverride ?? OPENROUTER_MODEL}) returned non-JSON: ${content.slice(0, 120)}`);
    return [];
  }
}

const STRIP_SECTION = /^\s*\[.*?\]\s*$/;
function normalizeWords(text: string): string[] {
  return text
    .split("\n")
    .filter((l) => !STRIP_SECTION.test(l))
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function wordAccuracy(ref: string[], hyp: string[]): { correct: number; total: number; acc: number } {
  const n = ref.length;
  const m = hyp.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i]![0] = i;
  for (let j = 0; j <= m; j++) dp[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const edits = dp[n]![m]!;
  const correct = Math.max(0, n - edits);
  return { correct, total: n, acc: n === 0 ? 0 : correct / n };
}

async function score(label: string, text: string, refWords: string[]): Promise<void> {
  const hyp = normalizeWords(text);
  const s = wordAccuracy(refWords, hyp);
  console.log(`  ${label.padEnd(28)}: ${hyp.length.toString().padStart(4)} hyp / ${s.correct}/${s.total} ref -> ${(s.acc * 100).toFixed(1)}%`);
}

async function testOne(num: number): Promise<void> {
  const mp3 = resolve(UPLOADS, `${num}.mp3`);
  const txt = resolve(UPLOADS, `${num}.txt`);
  const reference = await readFile(txt, "utf8");
  const refWords = normalizeWords(reference);

  console.log(`\n=== ${num}.mp3 (${refWords.length} reference words) ===`);
  console.log(`[upload] mp3 -> replicate...`);
  const audioUrl = await uploadToReplicate(mp3);

  console.log(`[demucs] vocal isolation...`);
  const vocalsUrl = await runDemucs(audioUrl);

  console.log(`[whisperx] vocals + mix + mix(t=0.4) in parallel...`);
  const [wxVocals, wxMix, wxMixT] = await Promise.all([
    runWhisperX(vocalsUrl, "vocals"),
    runWhisperX(audioUrl, "mix"),
    runWhisperX(audioUrl, "mix-t04", { temperature: 0.4 }),
  ]);

  // Path A: vocals-only (current production approach).
  const vocalsRaw = rawTranscript(wxVocals);
  // Path B: mix-only (skip Demucs at inference time).
  const mixRaw = rawTranscript(wxMix);
  // Path C: merged timeline (vocals + mix gap-fill).
  const vSegs = segmentsOf(wxVocals, "vocals");
  const mSegs = segmentsOf(wxMix, "mix");
  const merged = mergeSegments(vSegs, mSegs);
  const mergedRaw = merged.map((s) => s.text).join(" ");

  console.log(`\nraw scores (before LLM):`);
  await score("vocals-only", vocalsRaw, refWords);
  await score("mix-only", mixRaw, refWords);
  await score("merged (vocals+mix)", mergedRaw, refWords);

  console.log(`\n[llm] structuring + reconciling each path...`);
  const vocalsFragments = (wxVocals.segments ?? []).map((s) => s.text ?? "").filter(Boolean);
  const mixFragments = (wxMix.segments ?? []).map((s) => s.text ?? "").filter(Boolean);
  const mixTFragments = (wxMixT.segments ?? []).map((s) => s.text ?? "").filter(Boolean);
  const sources3 = { vocals: vocalsFragments, mix: mixFragments, mix_t04: mixTFragments };
  const [sVocals, sMix, sRFlash, sRSonnet, sROpus] = await Promise.all([
    llmStructure(vocalsFragments),
    llmStructure(mixFragments),
    llmReconcile(sources3, "google/gemini-2.5-flash"),
    llmReconcile(sources3, "anthropic/claude-sonnet-4.5"),
    llmReconcile(sources3, "anthropic/claude-opus-4.1"),
  ]);

  console.log(`\nstructured scores (after LLM):`);
  await score("vocals-only (Flash)", sVocals.join("\n"), refWords);
  await score("mix-only (Flash)", sMix.join("\n"), refWords);
  await score("reconciled (Flash)", sRFlash.join("\n"), refWords);
  await score("reconciled (Sonnet 4.5)", sRSonnet.join("\n"), refWords);
  await score("reconciled (Opus 4.1)", sROpus.join("\n"), refWords);

  console.log(`\n--- reconciled (Sonnet 4.5) ---\n${sRSonnet.join("\n")}`);
  console.log(`\n--- reconciled (Opus 4.1) ---\n${sROpus.join("\n")}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
  const songs = args.length > 0 ? args : [3];
  for (const n of songs) {
    try {
      await testOne(n);
    } catch (e) {
      console.error(`song ${n} failed:`, e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
