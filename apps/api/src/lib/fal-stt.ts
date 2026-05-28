import { env } from "../env.js";

/** One word/spacing/audio_event entry returned by ElevenLabs Scribe. */
export type ScribeWord = {
  text?: string;
  type?: "word" | "spacing" | "audio_event" | string;
  start?: number;
  end?: number;
  speaker_id?: string | null;
};

/** Full Scribe response shape (the bits we read; the model returns more). */
export type ScribeResponse = {
  text?: string;
  language_code?: string;
  language_probability?: number;
  words?: ScribeWord[];
};

const FAL_BASE = "https://fal.run";
const FAL_STORAGE = "https://rest.alpha.fal.ai/storage/upload/initiate";

/** Upload a presigned-or-public audio URL via fal's storage so the inference
 *  endpoint can fetch it — only needed when the source URL isn't already
 *  publicly fetchable. For Demucs vocals stems (Replicate CDN URLs) this is
 *  not needed: fal can pull them directly. */
export async function falUploadFromUrl(
  remoteUrl: string,
  filename = "audio.wav",
  contentType = "audio/wav",
): Promise<string> {
  const initiate = await fetch(FAL_STORAGE, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: filename, content_type: contentType }),
  });
  if (!initiate.ok) {
    throw new Error(`fal upload initiate failed: ${initiate.status} ${await initiate.text()}`);
  }
  const { upload_url, file_url } = (await initiate.json()) as {
    upload_url: string;
    file_url: string;
  };

  const audio = await fetch(remoteUrl);
  if (!audio.ok || !audio.body) {
    throw new Error(`fetch source audio failed: ${audio.status}`);
  }
  const buf = Buffer.from(await audio.arrayBuffer());
  const put = await fetch(upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buf,
  });
  if (!put.ok) {
    throw new Error(`fal upload PUT failed: ${put.status} ${await put.text()}`);
  }
  return file_url;
}

/**
 * Transcribe an audio URL with ElevenLabs Scribe via fal.ai. Returns the raw
 * response shape (caller adapts to Syllary's Lyrics type via mapScribe()).
 *
 * Scribe is purpose-built for long-form / repetitive audio — unlike Whisper
 * it doesn't suffer the "drop chorus repetitions" repetition-suppression
 * problem. On uploads/4.mp3 (8 chorus reps) Scribe catches 8/8 in ~3 seconds
 * where every Whisper variant we tested caught 2-4.
 *
 * The Replicate-delivered vocals stem URLs from Demucs are publicly fetchable
 * for ~24h, so we pass them straight through without an extra upload step.
 */
export async function transcribeWithScribe(audioUrl: string): Promise<ScribeResponse> {
  const res = await fetch(`${FAL_BASE}/fal-ai/elevenlabs/speech-to-text/scribe-v2`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_AI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: "eng",
      diarize: false,
      timestamps_granularity: "word",
    }),
  });
  if (!res.ok) {
    throw new Error(`fal scribe failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ScribeResponse;
}
