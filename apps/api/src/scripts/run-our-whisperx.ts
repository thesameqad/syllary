/**
 * Hit our self-hosted Replicate model end-to-end on uploads/4.mp3 and dump
 * the result. Resolves the latest version from the model page, uploads the
 * audio via Replicate's Files API, creates a prediction, polls until done.
 *
 *   pnpm tsx --env-file=../../.env src/scripts/run-our-whisperx.ts [path-to-mp3]
 *
 * Default audio: ../../uploads/4.mp3
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const MODEL_OWNER = "thesameqad";
const MODEL_NAME = "syllary-whisperx";

const audioPath = resolve(process.argv[2] ?? "../../uploads/4.mp3");
const token = process.env.REPLICATE_API_TOKEN;
if (!token) {
  console.error("REPLICATE_API_TOKEN missing from .env");
  process.exit(1);
}

console.log(`audio: ${audioPath}`);

// 1) Resolve latest model version
console.log("[1/4] resolving latest model version…");
const versionsRes = await fetch(
  `https://api.replicate.com/v1/models/${MODEL_OWNER}/${MODEL_NAME}/versions`,
  { headers: { Authorization: `Bearer ${token}` } },
);
if (!versionsRes.ok) {
  console.error(`versions list HTTP ${versionsRes.status}: ${await versionsRes.text()}`);
  process.exit(1);
}
const versionsBody = (await versionsRes.json()) as { results: { id: string; created_at: string }[] };
const latest = versionsBody.results?.[0];
if (!latest) {
  console.error("no versions found on model");
  process.exit(1);
}
console.log(`  version: ${latest.id} (created ${latest.created_at})`);

// 2) Upload audio file via Replicate Files API
console.log("[2/4] uploading audio to Replicate Files API…");
const audioBuf = await readFile(audioPath);
const form = new FormData();
form.append("content", new Blob([audioBuf], { type: "audio/mpeg" }), basename(audioPath));
const fileRes = await fetch("https://api.replicate.com/v1/files", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
if (!fileRes.ok) {
  console.error(`files upload HTTP ${fileRes.status}: ${await fileRes.text()}`);
  process.exit(1);
}
const fileBody = (await fileRes.json()) as { id: string; urls: { get: string } };
const audioUrl = fileBody.urls.get;
console.log(`  uploaded: ${fileBody.id}, url: ${audioUrl}`);

// 3) Create prediction
console.log("[3/4] creating prediction…");
const predRes = await fetch("https://api.replicate.com/v1/predictions", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    version: latest.id,
    input: { audio_file: audioUrl, align_output: true, temperature: 0 },
  }),
});
if (!predRes.ok) {
  console.error(`prediction create HTTP ${predRes.status}: ${await predRes.text()}`);
  process.exit(1);
}
const predBody = (await predRes.json()) as {
  id: string;
  status: string;
  urls: { get: string; cancel: string };
};
console.log(`  prediction: ${predBody.id} (${predBody.status})`);
console.log(`  web: https://replicate.com/p/${predBody.id}`);

// 4) Poll until done
console.log("[4/4] polling…");
const t0 = Date.now();
let last = predBody.status;
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const r = await fetch(predBody.urls.get, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await r.json()) as {
    status: string;
    error: string | null;
    logs: string | null;
    output: { segments?: { start: number; end: number; text: string; words?: unknown[] }[] } | null;
  };
  if (data.status !== last) {
    last = data.status;
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(0)}s  status=${data.status}`);
  }
  if (data.status === "succeeded") {
    console.log("\n=== LOGS ===");
    console.log(data.logs ?? "(none)");
    const segs = data.output?.segments ?? [];
    console.log(`\n=== ${segs.length} SEGMENTS ===`);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      const wc = (s.words ?? []).length;
      console.log(
        `  L${i.toString().padStart(2)} ${s.start.toFixed(2).padStart(6)}s – ${s.end.toFixed(2).padStart(6)}s  words=${String(wc).padStart(3)}  ${JSON.stringify(s.text)}`,
      );
    }
    const re = /what\s*is\s*wrong\s*with\s*you/gi;
    let chorus = 0;
    for (const s of segs) {
      const m = (s.text ?? "").match(re);
      if (m) chorus += m.length;
    }
    console.log(`\nchorus reps: ${chorus}/8 ${chorus >= 8 ? "✅" : "⚠"}`);
    process.exit(0);
  }
  if (data.status === "failed" || data.status === "canceled") {
    console.log("\n=== ERROR ===");
    console.log(data.error);
    console.log("\n=== LOGS ===");
    console.log(data.logs ?? "(none)");
    process.exit(1);
  }
}
