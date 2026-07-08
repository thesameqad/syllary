import "../load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "../env.js";
import { presignGet } from "./../lib/r2.js";

/**
 * Image-route benchmark: OpenRouter vs fal for the Gemini image models
 * ("Nano Banana"), mirroring motion-route-bench.ts. Three phases:
 *   1. Schema probes (free 422s) — pin fal param names + video duration enums.
 *   2. T2I speed — real backdrop-style prompt w/ baked lyric, 2K 16:9:
 *      flash solo + 4× parallel, pro solo, on both routes.
 *   3. Character-reference consistency — 2 characters (Victoria Song ×2 photos,
 *      Rex ×1): OpenRouter interleaved labels vs fal flat image_urls + ordered
 *      manifest. All outputs saved for visual QC.
 *
 *   pnpm --filter @syllary/api exec tsx src/scripts/image-route-bench.ts
 */

const OUT_DIR =
  "C:\\Users\\thesa\\AppData\\Local\\Temp\\claude\\C--Users-thesa-Documents-src-ErmanAI-syllary\\25d89ce9-a539-49da-b27d-dcb60a33e53f\\scratchpad\\image-bench";

const OR_FLASH = "google/gemini-3.1-flash-image-preview";
const OR_PRO = "google/gemini-3-pro-image-preview";
const FAL_FLASH = "fal-ai/gemini-3.1-flash-image-preview";
const FAL_PRO = "fal-ai/gemini-3-pro-image-preview";

// Founder-owned character reference photos (song_elements).
const VICTORIA_KEYS = [
  "song-elements/b0681aa7-55d4-4967-8fca-163adfccb6ac-4dd71fc4-8296-46e3-b607-f620ee150314",
  "song-elements/16972a1f-2d84-42cc-b1c3-9441ffa6243e-661b8976-229e-4ddd-944b-2da0243e71e8",
];
const REX_KEYS = [
  "song-elements/e4b7c075-6e6d-4982-a007-d9eeafb23d7d-3246ca99-3ef7-4867-898d-1f6e431b37f6",
];

const STYLE = "warm suburban morning, soft film grain, cozy Americana, gentle golden light";
const LYRIC = "Lazy Sunday morning light";

// Mirrors buildBackdropPrompt output shape (single line, baked typography).
const T2I_PROMPT =
  `Cinematic 16:9 widescreen landscape frame for a music lyric video. This is ONE specific ` +
  `moment in the song — illustrate exactly this moment, not a generic image of the whole song. ` +
  `Art direction: ${STYLE}. Depict the literal action, imagery and emotion of this exact ` +
  `moment: a woman lying on a couch while the TV plays softly. Render this exact lyric as the ` +
  `hero typography of the image, large and beautifully legible, integrated INTO the scene and ` +
  `styled to match the art direction: "${LYRIC}". Spell it EXACTLY as written. Show ONLY this ` +
  `line of text — no other words, captions, watermarks, logos, signatures, or duplicate text. ` +
  `Anchor the text to a physical surface or object in the scene — a billboard, wall, sign, ` +
  `screen, banner, or the side of an object — with matching perspective and lighting, so it ` +
  `exists INSIDE the world. Never float it as a flat caption over the image. Keep the text ` +
  `fully inside the frame with generous safe margins from every edge so it is never cut off, ` +
  `with strong contrast against the background. No real recognizable people or singers. ` +
  `Rich depth, dramatic lighting, high detail.`;

// 2-character block mirroring buildBackdropPrompt's multi-char branch.
const REF_SCENE =
  `Cinematic 16:9 widescreen landscape frame for a music lyric video. ` +
  `Art direction: ${STYLE}. Depict the literal action, imagery and emotion of this exact ` +
  `moment: Victoria Song sits on the porch steps laughing while Rex sits beside her. `;
const REF_TAIL =
  `Preserve each one's face, hair, build and defining features, but fully RESTYLE them into ` +
  `the art direction above. Keep each distinct and recognizable. The photos define WHO they ` +
  `are, not what they're doing or the setting. Render this exact lyric as the hero typography ` +
  `of the image, large and beautifully legible, integrated INTO the scene: "${LYRIC}". Spell ` +
  `it EXACTLY as written. Show ONLY this line of text. Rich depth, dramatic lighting, high detail.`;
const REF_PROMPT_LABELED =
  REF_SCENE +
  `The reference photos are LABELED with each character's name (Victoria Song, Rex). The ` +
  `attached reference photos show EXACTLY 2 distinct recurring CHARACTERS — Victoria Song and ` +
  `Rex (a character may have several photos that are just extra angles of the SAME person — ` +
  `do NOT treat those as additional people). Depict EXACTLY these 2 characters, no duplicates ` +
  `and no extra people. Match each by their NAME LABEL; ` +
  REF_TAIL;
const REF_PROMPT_ORDERED =
  REF_SCENE +
  `The attached reference photos are in a FIXED ORDER: photos 1 and 2 show Victoria Song ` +
  `(two angles of the SAME person); photo 3 shows Rex. They show EXACTLY 2 distinct recurring ` +
  `CHARACTERS — Victoria Song and Rex. Depict EXACTLY these 2 characters, no duplicates and ` +
  `no extra people. Match each by their photo position as described; ` +
  REF_TAIL;

type Timing = {
  route: string;
  label: string;
  ok: boolean;
  totalMs?: number;
  queueMs?: number;
  generateMs?: number;
  bytes?: number;
  file?: string;
  error?: string;
};

function ms(n?: number): string {
  return n === undefined ? "—" : `${(n / 1000).toFixed(1)}s`;
}

type OrContent = string | Array<Record<string, unknown>>;

async function orImage(label: string, model: string, content: OrContent): Promise<Timing> {
  const t: Timing = { route: `openrouter:${model.split("/")[1]}`, label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        modalities: ["image", "text"],
        messages: [{ role: "user", content }],
        image_config: { aspect_ratio: "16:9", image_size: "2K" },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; images?: { image_url?: { url?: string } }[] } }[];
    };
    const dataUrl = data.choices?.[0]?.message?.images?.find((p) => p.image_url?.url)?.image_url
      ?.url;
    if (!dataUrl?.startsWith("data:")) throw new Error("no image in response");
    const buf = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    t.bytes = buf.length;
    t.totalMs = Date.now() - t0;
    t.file = `${label.replace(/[^a-z0-9-]/gi, "_")}.png`;
    writeFileSync(join(OUT_DIR, t.file), buf);
    t.ok = true;
  } catch (e) {
    t.error = (e as Error).message;
    t.totalMs = Date.now() - t0;
  }
  return t;
}

async function falImage(
  label: string,
  model: string,
  input: Record<string, unknown>,
): Promise<Timing> {
  const t: Timing = { route: `fal:${model.replace("fal-ai/", "")}`, label, ok: false };
  const t0 = Date.now();
  try {
    const res = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`submit HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const job = (await res.json()) as { status_url?: string; response_url?: string };
    if (!job.status_url || !job.response_url) throw new Error("no queue URLs");
    const tSubmitted = Date.now();
    let tWorking: number | undefined;
    let done = false;
    const deadline = Date.now() + 8 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      const s = await fetch(job.status_url, {
        headers: { Authorization: `Key ${env.FAL_AI_KEY}` },
      });
      const sd = (await s.json()) as { status?: string };
      if (sd.status === "IN_PROGRESS" && tWorking === undefined) tWorking = Date.now();
      if (sd.status === "COMPLETED") {
        done = true;
        break;
      }
      if (sd.status !== "IN_QUEUE" && sd.status !== "IN_PROGRESS") {
        throw new Error(`status ${sd.status}`);
      }
    }
    if (!done) throw new Error("timed out");
    const tDone = Date.now();
    t.queueMs = (tWorking ?? tDone) - tSubmitted;
    t.generateMs = tDone - (tWorking ?? tSubmitted);
    const r = await fetch(job.response_url, {
      headers: { Authorization: `Key ${env.FAL_AI_KEY}` },
    });
    if (!r.ok) throw new Error(`result HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data = (await r.json()) as { images?: { url?: string }[]; image?: { url?: string } };
    const url = data.images?.[0]?.url ?? data.image?.url;
    if (!url) throw new Error(`no image url: ${JSON.stringify(data).slice(0, 250)}`);
    const dl = await fetch(url);
    const buf = Buffer.from(await dl.arrayBuffer());
    t.bytes = buf.length;
    t.totalMs = Date.now() - t0;
    t.file = `${label.replace(/[^a-z0-9-]/gi, "_")}.png`;
    writeFileSync(join(OUT_DIR, t.file), buf);
    t.ok = true;
  } catch (e) {
    t.error = (e as Error).message;
    t.totalMs = Date.now() - t0;
  }
  return t;
}

/** POST a deliberately invalid body and print the validation detail — free way
 *  to learn a fal model's exact schema (fal validates before billing). */
async function probe(model: string, body: Record<string, unknown>): Promise<void> {
  const res = await fetch(`https://queue.fal.run/${model}`, {
    method: "POST",
    headers: { Authorization: `Key ${env.FAL_AI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = (await res.text()).slice(0, 700);
  console.log(`\nPROBE ${model} (${JSON.stringify(body).slice(0, 80)}) → HTTP ${res.status}`);
  console.log(`  ${text}`);
}

function printTable(rows: Timing[]): void {
  console.log("\n=== RESULTS ===");
  console.log(
    "route".padEnd(42) +
      "label".padEnd(22) +
      "queue".padEnd(8) +
      "gen".padEnd(8) +
      "TOTAL".padEnd(9) +
      "result",
  );
  for (const r of rows) {
    console.log(
      r.route.padEnd(42) +
        r.label.padEnd(22) +
        ms(r.queueMs).padEnd(8) +
        ms(r.generateMs).padEnd(8) +
        ms(r.totalMs).padEnd(9) +
        (r.ok ? `OK ${((r.bytes ?? 0) / 1024).toFixed(0)}KB → ${r.file}` : `FAIL: ${r.error}`),
    );
  }
}

async function main(): Promise<void> {
  if (!env.OPENROUTER_API_KEY || !env.FAL_AI_KEY) throw new Error("keys missing");
  mkdirSync(OUT_DIR, { recursive: true });

  // ---------- Phase 1: schema probes (free) ----------
  console.log("########## PHASE 1: SCHEMA PROBES ##########");
  await probe(FAL_FLASH, {});
  await probe(`${FAL_FLASH}/edit`, {});
  await probe(FAL_PRO, {});
  await probe(`${FAL_PRO}/edit`, {});
  // Bogus enum values to surface allowed lists without generating:
  await probe(FAL_FLASH, { prompt: "x", aspect_ratio: "16:9", resolution: "9K" });
  // Video slugs (for the migration plan): duration + param enums.
  await probe("xai/grok-imagine/image-to-video", {
    prompt: "x",
    image_url: "https://example.com/x.jpg",
    duration: "99",
    resolution: "720p",
    aspect_ratio: "16:9",
  });
  await probe("bytedance/seedance-2.0/fast/image-to-video", {
    prompt: "x",
    image_url: "https://example.com/x.jpg",
    duration: "99",
    resolution: "480p",
    aspect_ratio: "16:9",
  });
  await probe("fal-ai/kling-video/v3/standard/image-to-video", {});
  await probe("fal-ai/kling-video/v3/standard/image-to-video", {
    prompt: "x",
    image_url: "https://example.com/x.jpg",
    duration: "99",
  });

  const results: Timing[] = [];

  // ---------- Phase 2: T2I speed ----------
  console.log("\n########## PHASE 2: T2I SPEED (2K, 16:9) ##########");
  console.log("--- solo: OR flash / OR pro / fal flash / fal pro (sequential) ---");
  results.push(await orImage("t2i-or-flash-solo", OR_FLASH, T2I_PROMPT));
  results.push(await orImage("t2i-or-pro-solo", OR_PRO, T2I_PROMPT));
  const falT2I = {
    prompt: T2I_PROMPT,
    aspect_ratio: "16:9",
    resolution: "2K",
    num_images: 1,
  };
  results.push(await falImage("t2i-fal-flash-solo", FAL_FLASH, falT2I));
  results.push(await falImage("t2i-fal-pro-solo", FAL_PRO, falT2I));
  printTable(results);

  console.log("\n--- 4× parallel flash: OpenRouter then fal (IMAGE_CONCURRENCY=4) ---");
  const orPar = await Promise.all(
    [1, 2, 3, 4].map((i) => orImage(`t2i-or-flash-par${i}`, OR_FLASH, T2I_PROMPT)),
  );
  results.push(...orPar);
  const falPar = await Promise.all(
    [1, 2, 3, 4].map((i) => falImage(`t2i-fal-flash-par${i}`, FAL_FLASH, falT2I)),
  );
  results.push(...falPar);
  printTable(results);

  // ---------- Phase 3: character-reference consistency ----------
  console.log("\n########## PHASE 3: CHARACTER REFERENCES (2 chars, 3 photos) ##########");
  const vicUrls = await Promise.all(VICTORIA_KEYS.map((k) => presignGet(k)));
  const rexUrls = await Promise.all(REX_KEYS.map((k) => presignGet(k)));
  // Save the reference photos themselves for side-by-side QC.
  for (const [i, u] of [...vicUrls, ...rexUrls].entries()) {
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    writeFileSync(join(OUT_DIR, `ref-photo-${i + 1}.jpg`), buf);
  }
  const orRefContent: Array<Record<string, unknown>> = [
    { type: "text", text: REF_PROMPT_LABELED },
    { type: "text", text: "Reference photos of Victoria Song:" },
    ...vicUrls.map((url) => ({ type: "image_url", image_url: { url } })),
    { type: "text", text: "Reference photos of Rex:" },
    ...rexUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const falRefInput = {
    prompt: REF_PROMPT_ORDERED,
    image_urls: [...vicUrls, ...rexUrls],
    aspect_ratio: "16:9",
    resolution: "2K",
    num_images: 1,
  };
  results.push(await orImage("ref-or-flash", OR_FLASH, orRefContent));
  results.push(await falImage("ref-fal-flash", `${FAL_FLASH}/edit`, falRefInput));
  results.push(await orImage("ref-or-pro", OR_PRO, orRefContent));
  results.push(await falImage("ref-fal-pro", `${FAL_PRO}/edit`, falRefInput));

  printTable(results);
  console.log(`\nAll outputs in: ${OUT_DIR}`);
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
