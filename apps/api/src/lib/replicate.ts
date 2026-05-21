import Replicate from "replicate";
import { env } from "../env.js";

const replicate = new Replicate({ auth: env.REPLICATE_API_TOKEN });

let whisperxVersionCache: string | null = null;
let demucsVersionCache: string | null = null;

async function whisperxVersion(): Promise<string> {
  if (whisperxVersionCache) return whisperxVersionCache;
  const model = await replicate.models.get("victor-upmeet", "whisperx");
  const version = model.latest_version?.id;
  if (!version) throw new Error("Could not resolve victor-upmeet/whisperx version");
  whisperxVersionCache = version;
  return version;
}

async function demucsVersion(): Promise<string> {
  if (demucsVersionCache) return demucsVersionCache;
  const model = await replicate.models.get("ryan5453", "demucs");
  const version = model.latest_version?.id;
  if (!version) throw new Error("Could not resolve ryan5453/demucs version");
  demucsVersionCache = version;
  return version;
}

/** Start Demucs vocal isolation. One retry on a transient start error (rule #9). */
export async function startSeparation(audioUrl: string): Promise<string> {
  const version = await demucsVersion();
  const input = { audio: audioUrl, stem: "vocals" };
  try {
    return (await replicate.predictions.create({ version, input })).id;
  } catch {
    return (await replicate.predictions.create({ version, input })).id;
  }
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

/** Start a WhisperX transcription. One retry on a transient start error (rule #9). */
export async function startTranscription(audioUrl: string): Promise<string> {
  const version = await whisperxVersion();
  // Lower VAD thresholds so intro/quiet vocals aren't filtered out; align_output
  // gives word-level timestamps for karaoke sync.
  const input = {
    audio_file: audioUrl,
    align_output: true,
    vad_onset: 0.2,
    vad_offset: 0.2,
  };
  try {
    const prediction = await replicate.predictions.create({ version, input });
    return prediction.id;
  } catch {
    const prediction = await replicate.predictions.create({ version, input });
    return prediction.id;
  }
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
