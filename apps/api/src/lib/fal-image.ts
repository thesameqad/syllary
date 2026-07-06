import type { AspectRatio } from "@syllary/shared";
import { env } from "../env.js";

// Cheap image generation via fal.ai (FLUX schnell by default). Used for AI
// album covers — a supplemental, no-embedded-text image where a fast diffusion
// model at ~$0.003/image is plenty (vs ~$0.068 for Nano Banana on OpenRouter,
// which we keep for lyric-VIDEO backdrops that DO need rendered text).
//
// ALSO home of the Lite tier's video backdrops: Qwen-Image ($0.02/image at
// ≤1MP — fal bills per rounded-UP megapixel) renders embedded lyric text well
// enough for the budget tier, guarded by a cheap vision-QC + one retry.
//
// fal.run is synchronous (the HTTP response IS the result), mirroring the
// auth + endpoint pattern in fal-stt.ts.

const FAL_BASE = "https://fal.run";

/** fal image_size presets. Covers are square. */
type FalImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

type FalImageResponse = {
  images?: { url?: string; content_type?: string }[];
};

/** Generate one image via fal.ai and return its raw bytes + content type.
 *  Throws on any failure (callers map this to a user-facing error). */
export async function generateFalImage(opts: {
  prompt: string;
  imageSize?: FalImageSize;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(`${FAL_BASE}/${env.FAL_IMAGE_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${env.FAL_AI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: opts.prompt,
      image_size: opts.imageSize ?? "square_hd",
      num_images: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`fal image failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as FalImageResponse;
  const image = data.images?.find((i) => i?.url);
  if (!image?.url) {
    throw new Error("fal image returned no URL.");
  }

  // fal serves the result from its CDN; fetch it into bytes for R2 upload.
  const file = await fetch(image.url);
  if (!file.ok) {
    throw new Error(`fetch fal image failed: ${file.status}`);
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error("fal image was empty.");
  }
  const contentType =
    image.content_type || file.headers.get("content-type") || "image/jpeg";
  return { buffer, contentType };
}

// ---------------------------------------------------------------------------
// Lite tier — Qwen-Image video backdrops
// ---------------------------------------------------------------------------

const QWEN_MODEL = "fal-ai/qwen-image";

/** ≤1MP canvas per aspect — fal rounds UP per megapixel, so staying under
 *  1,000,000 px is what makes a Qwen image cost exactly $0.02. The stitch
 *  upscales to the 1080p canvas with lanczos. */
const LITE_SIZES: Record<AspectRatio, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "1:1": { width: 1000, height: 1000 },
};

/** Diffusion-dialect backdrop prompt. Qwen (unlike Gemini) treats the whole
 *  prompt as scene content — instruction-style prompts get their meta-words
 *  ("hero", "16:9") painted INTO the image. So: scene first, the lyric quoted
 *  exactly once, no meta-vocabulary. Validated in the Jul 2026 bake-off. */
export function buildLitePrompt(opts: {
  style: string;
  lyricText: string;
  direction?: string;
  renderText: boolean;
}): string {
  // Strip "@" from typed mentions ("@Rex wags" → "Rex wags") — Lite has no cast
  // references, and Qwen paints stray symbols as literal scene text.
  const direction = opts.direction?.trim().replace(/@(?=[\p{L}\d])/gu, "");
  const scene = direction || (opts.lyricText ? `a scene depicting this moment: ${opts.lyricText}` : "an atmospheric instrumental scene");
  if (!opts.renderText || !opts.lyricText) {
    return `${opts.style}. ${scene}. Absolutely no text, letters or words anywhere in the image. Rich depth, dramatic lighting, high detail, no real people.`;
  }
  // Grouped scenes bake a stanza block: same validated dialect, N stacked lines.
  const lineCount = opts.lyricText.split("\n").length;
  const textClause =
    lineCount > 1
      ? `Large beautiful glowing text integrated into the scene, as ${lineCount} stacked lines in this exact order, reads "${opts.lyricText}". Those lines are the only text in the image — do not draw the quotation marks. `
      : `Large beautiful glowing text integrated into the scene reads "${opts.lyricText}". That sentence is the only text in the image — do not draw the quotation marks. `;
  return (
    `${opts.style}. ${scene}. ` +
    textClause +
    `Perfectly legible, centered with wide margins. Rich depth, dramatic lighting, high detail, no real people.`
  );
}

/** One Qwen generation via the queue API (the sync endpoint can outlive
 *  undici's headers timeout on a cold queue). fal's queue occasionally strands
 *  a request IN_QUEUE for minutes on a cold start while a FRESH submit lands on
 *  a warm worker in seconds — so instead of one long wait, we submit, give it
 *  90s, and resubmit up to twice. Returns raw image bytes. */
async function generateQwenOnce(prompt: string, aspectRatio: AspectRatio): Promise<Buffer> {
  return falQueueImage(QWEN_MODEL, {
    prompt,
    image_size: LITE_SIZES[aspectRatio],
    num_images: 1,
    output_format: "png",
  });
}

/** Generic fal image call with the queue + resubmit-on-cold-queue discipline —
 *  shared by Lite backdrops (Qwen t2i) and shared-clip text plates (inpaint). */
export async function falQueueImage(model: string, body: Record<string, unknown>): Promise<Buffer> {
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await falImageAttempt(model, body, attempt === 2 ? 180_000 : 90_000);
    } catch (e) {
      lastErr = (e as Error).message;
      if (!/timed out|IN_QUEUE|HTTP 5\d\d|network|fetch failed/i.test(lastErr)) throw e;
    }
  }
  throw new Error(`fal image failed after retries: ${lastErr}`);
}

async function falImageAttempt(
  model: string,
  body: Record<string, unknown>,
  waitMs: number,
): Promise<Buffer> {
  const t0 = Date.now();
  const submit = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!submit.ok) {
    throw new Error(`qwen submit HTTP ${submit.status}: ${(await submit.text()).slice(0, 200)}`);
  }
  const job = (await submit.json()) as { status_url?: string; response_url?: string };
  if (!job.status_url || !job.response_url) throw new Error("qwen submit returned no queue urls");

  const deadline = Date.now() + waitMs;
  let status = "";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const s = await fetch(job.status_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
      status = ((await s.json()) as { status?: string }).status ?? "";
    } catch {
      continue; // network blip → re-poll
    }
    if (status === "COMPLETED") break;
    if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") throw new Error(`fal image status ${status}`);
  }
  if (status !== "COMPLETED") throw new Error(`fal image timed out (${status || "no status"})`);
  console.log(`[fal-image] ${model} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const res = await fetch(job.response_url, { headers: { Authorization: `Key ${env.FAL_AI_KEY}` } });
  if (!res.ok) throw new Error(`fal image result HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as FalImageResponse & { image?: { url?: string } };
  const url = data.images?.find((i) => i?.url)?.url ?? data.image?.url;
  if (!url) throw new Error("fal image returned no URL");
  const file = await fetch(url);
  if (!file.ok) throw new Error(`fal image download HTTP ${file.status}`);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) throw new Error("fal image was empty");
  return buffer;
}

/** Normalize to bare lowercase words (case/punctuation/line breaks ignored). */
function lyricWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s']/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Every expected word must appear IN ORDER in the transcription (gaps allowed —
 *  full scene frames legitimately contain incidental sign text around the lyric). */
export function lyricMatchesTranscription(expected: string, transcribed: string): boolean {
  const want = lyricWords(expected);
  const got = lyricWords(transcribed);
  let i = 0;
  for (const w of got) {
    if (w === want[i]) i += 1;
    if (i === want.length) return true;
  }
  return want.length === 0;
}

/** Vision QC: does the frame show exactly the lyric? Cheap (Gemini Flash,
 *  ~$0.0002). The model TRANSCRIBES what it sees and the comparison happens in
 *  code — a yes/no "does it match?" question lets the model answer charitably
 *  (it PASSed a plate missing two words) or over-strictly. Returns true on any
 *  QC infrastructure failure (a possibly-typo'd frame is still fixable in the
 *  editor; blocking the job is worse). */
export async function lyricTextLooksRight(image: Buffer, lyricText: string): Promise<boolean> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL,
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Transcribe ALL text visible in this image exactly as written, including any ` +
                  `partial or garbled words. Reply with ONLY the transcription, nothing else. ` +
                  `If no text is visible, reply NONE.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${image.toString("base64")}` },
              },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content ?? "";
    const ok = lyricMatchesTranscription(lyricText, reply);
    if (!ok) console.log(`[qc] lyric mismatch — wanted "${lyricText}", read "${reply.slice(0, 160)}"`);
    return ok;
  } catch {
    return true;
  }
}

/** Generate one Lite-tier backdrop: Qwen-Image at ≤1MP with the lyric rendered
 *  into the scene, vision-QC'd with ONE regenerate on a text mismatch (the
 *  retry is priced into the Lite image rate). Returns raw image bytes — the
 *  pipeline normalizes to JPEG like every other frame. */
export async function generateLiteBackdrop(opts: {
  style: string;
  lyricText: string;
  aspectRatio: AspectRatio;
  renderText: boolean;
  direction?: string;
  promptOverride?: string;
}): Promise<Buffer> {
  const prompt = opts.promptOverride ?? buildLitePrompt(opts);
  const first = await generateQwenOnce(prompt, opts.aspectRatio);
  if (!opts.renderText || !opts.lyricText) return first;
  if (await lyricTextLooksRight(first, opts.lyricText)) return first;
  // One retry — diffusion typos are per-roll, so a fresh roll usually lands.
  // Keep the second attempt either way; the editor's Regenerate covers the rest.
  return generateQwenOnce(prompt, opts.aspectRatio);
}
