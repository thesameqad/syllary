import type { GenerationMode } from "@syllary/shared";
import Replicate from "replicate";
import { env } from "../env.js";

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

const versionCache = new Map<string, string>();

async function modelVersion(owner: string, name: string): Promise<string> {
  const key = `${owner}/${name}`;
  const cached = versionCache.get(key);
  if (cached) return cached;
  const model = await replicate.models.get(owner, name);
  const version = model.latest_version?.id;
  if (!version) throw new Error(`Could not resolve ${key} version`);
  versionCache.set(key, version);
  return version;
}

/**
 * Create a Replicate prediction with exponential backoff on 429 (rate limit).
 * Accounts with < $5 credit are throttled to 1 req/sec burst, so naïve parallel
 * calls (e.g. Pro's 3-way WhisperX) need real backoff or the whole batch fails.
 */
async function createPrediction(version: string, input: Record<string, unknown>): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return (await replicate.predictions.create({ version, input })).id;
    } catch (e) {
      const err = e as { response?: { status?: number; headers?: { get?: (k: string) => string | null } } };
      const status = err.response?.status;
      if (status === 429 && attempt < 5) {
        const retryAfter = Number(err.response?.headers?.get?.("retry-after") ?? 5);
        await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
        continue;
      }
      // One last retry on non-429 errors (transient network, etc.) per rule #9.
      if (attempt === 0) continue;
      throw e;
    }
  }
  throw new Error("createPrediction: exhausted retries");
}

/** Per-mode Demucs config. Fast uses the default model with no shift averaging
 *  (fastest, still acceptable on clean tracks). Normal/Pro use the fine-tuned
 *  variant; Pro additionally averages two shifts for cleaner stems on dense
 *  material at ~2× the GPU time. */
function demucsInputFor(audioUrl: string, mode: GenerationMode): Record<string, unknown> {
  switch (mode) {
    case "fast":
      return { audio: audioUrl, stem: "vocals", model: "htdemucs", shifts: 1 };
    case "normal":
      return { audio: audioUrl, stem: "vocals", model: "htdemucs_ft", shifts: 1 };
    case "pro":
      return { audio: audioUrl, stem: "vocals", model: "htdemucs_ft", shifts: 2 };
  }
}

/** Start Demucs vocal isolation tuned for the given mode. */
export async function startSeparation(audioUrl: string, mode: GenerationMode): Promise<string> {
  const version = await modelVersion("ryan5453", "demucs");
  return createPrediction(version, demucsInputFor(audioUrl, mode));
}

/** Extract the isolated-vocals URL from a succeeded Demucs prediction. */
export function vocalsUrlFromOutput(output: unknown): string | null {
  const o = (output ?? {}) as { vocals?: unknown };
  return typeof o.vocals === "string" ? o.vocals : null;
}

export type ReplicateStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export type ReplicatePrediction = {
  id: string;
  status: ReplicateStatus;
  output: unknown;
  error: string | null;
};

/** WhisperX model slug per mode. Fast uses the base wrapper (large-v2) which
 *  runs on cheaper hardware; Normal/Pro use the A40 wrapper running large-v3. */
function whisperxSlugFor(mode: GenerationMode): { owner: string; name: string } {
  return mode === "fast"
    ? { owner: "victor-upmeet", name: "whisperx" }
    : { owner: "victor-upmeet", name: "whisperx-a40-large" };
}

async function startOneTranscription(
  audioUrl: string,
  mode: GenerationMode,
  temperature: number,
): Promise<string> {
  const slug = whisperxSlugFor(mode);
  const version = await modelVersion(slug.owner, slug.name);
  // Asymmetric VAD: aggressive ONSET (0.05) keeps quiet/whispered/rapped
  // vocals from being missed at chunk boundaries; OFFSET at pyannote's
  // default (0.363) so segments close between phrases instead of gluing
  // adjacent chorus repetitions into one long chunk. Long repetitive chunks
  // trip Whisper's compression-ratio fallback, which discards the whole
  // segment and produces phantom forced-aligned phrases — the failure mode
  // seen on heavily-repetitive songs. language:"en" skips language detection.
  return createPrediction(version, {
    audio_file: audioUrl,
    align_output: true,
    vad_onset: 0.05,
    vad_offset: 0.363,
    language: "en",
    temperature,
  });
}

/**
 * Start the WhisperX call(s) appropriate for the given mode. Returns either a
 * single ID (fast/normal) or three IDs in [vocals, mix, mix-t04] order (pro).
 * Pro's calls run sequentially so the per-call backoff handles rate limits
 * without orphaning predictions.
 */
export async function startTranscriptionForMode(
  vocalsUrl: string,
  mixUrl: string,
  mode: GenerationMode,
): Promise<string[]> {
  if (mode === "pro") {
    const vocals = await startOneTranscription(vocalsUrl, mode, 0);
    const mix = await startOneTranscription(mixUrl, mode, 0);
    const mixT = await startOneTranscription(mixUrl, mode, 0.4);
    return [vocals, mix, mixT];
  }
  // fast + normal: single greedy pass on the isolated vocal stem.
  return [await startOneTranscription(vocalsUrl, mode, 0)];
}

export async function getPrediction(id: string): Promise<ReplicatePrediction> {
  const p = await replicate.predictions.get(id);
  return {
    id: p.id,
    status: p.status as ReplicateStatus,
    output: p.output,
    error: p.error ? String(p.error) : null,
  };
}
