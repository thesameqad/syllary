/**
 * Re-run WhisperX with different decoding params on a known vocals URL so we
 * can prove which knob recovers the missing chorus repetitions. Dumps each
 * variant's segments to debug/<songId>/whisperx-<label>.json.
 */
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Replicate from "replicate";
import { env } from "../env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const songId = process.argv[2];
const vocalsUrl = process.argv[3];
if (!songId || !vocalsUrl) {
  console.error("usage: tsx src/scripts/probe-whisperx-params.ts <songId> <vocalsUrl>");
  process.exit(1);
}

const debugDir = resolve(__dirname, "..", "..", "debug", songId);
await mkdir(debugDir, { recursive: true });

const variants: { label: string; input: Record<string, unknown> }[] = [
  {
    label: "vad_offset_0.5",
    input: { audio_file: vocalsUrl, align_output: true, vad_onset: 0.05, vad_offset: 0.5, language: "en", temperature: 0 },
  },
];

const model = await replicate.models.get("victor-upmeet", "whisperx");
const version = model.latest_version?.id;
if (!version) {
  console.error("could not resolve whisperx version");
  process.exit(1);
}

async function waitFor(id: string): Promise<{ status: string; output: unknown; error: string | null }> {
  for (;;) {
    const p = await replicate.predictions.get(id);
    if (p.status === "failed" || p.status === "canceled") return { status: p.status, output: p.output, error: String(p.error ?? "") };
    if (p.status === "succeeded") return { status: p.status, output: p.output, error: null };
    await new Promise((r) => setTimeout(r, 2500));
  }
}

type Word = { word?: string; text?: string; start?: number; end?: number };
type Seg = { start?: number; end?: number; text?: string; words?: Word[] };
type Out = { segments?: Seg[]; detected_language?: string };

for (const v of variants) {
  console.log(`\n=== ${v.label} ===`);
  console.log("  starting prediction…");
  let pred;
  try {
    pred = await replicate.predictions.create({ version, input: v.input });
  } catch (e) {
    console.error("  create failed:", (e as Error).message);
    continue;
  }
  console.log("  id:", pred.id);
  const result = await waitFor(pred.id);
  if (result.status !== "succeeded") {
    console.error("  prediction failed:", result.error);
    continue;
  }
  await writeFile(resolve(debugDir, `whisperx-${v.label}.json`), JSON.stringify(result.output, null, 2));
  const o = result.output as Out;
  const segs = o.segments ?? [];
  console.log(`  segments: ${segs.length}`);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    console.log(`    L${i.toString().padStart(2)} ${s.start?.toFixed(2).padStart(6)}s – ${s.end?.toFixed(2).padStart(6)}s  ${JSON.stringify((s.text ?? "").trim())}`);
  }
}

console.log("\nDone.");
process.exit(0);
