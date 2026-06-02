import "../load-env.js";
import { spawnSync } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { buildSegments, type Lyrics } from "@syllary/shared";
import { generateBackdrop } from "../lib/openrouter-image.js";
import { stitchLyricsVideo, type StitchSegment } from "../lib/ffmpeg.js";

// End-to-end smoke test of the risky core: real OpenRouter image gen + the full
// ffmpeg Ken-Burns + ASS subtitle + audio-mux stitch. Run: tsx src/scripts/test-lyric-video.ts
async function main() {
  const lyrics: Lyrics = {
    language: "en",
    lines: [
      { text: "Neon rivers run through midnight", start: 0.6, end: 3.4, words: [], section: null },
      { text: "Chasing echoes of the skyline", start: 3.6, end: 6.4, words: [], section: null },
      { text: "We fade into the light", start: 6.6, end: 9.2, words: [], section: null },
    ],
  };

  const segs = buildSegments(lyrics, 11);
  console.log("buildSegments ->");
  console.table(
    segs.map((s) => ({ i: s.index, clip: `${s.clipStart}-${s.clipEnd.toFixed(2)}`, text: `${s.start}-${s.end.toFixed(2)}` })),
  );

  const workDir = path.join(os.tmpdir(), "syllary-video-test");
  await mkdir(workDir, { recursive: true });

  const stitch: StitchSegment[] = [];
  for (const s of segs) {
    console.log(`generating backdrop ${s.index} for "${s.text}"…`);
    const buf = await generateBackdrop({
      style: "dreamy neon synthwave city at night, cinematic, volumetric haze",
      lineText: s.text,
      aspectRatio: "16:9",
      imageSize: "2K",
      quality: "fast",
    });
    const f = path.join(workDir, `img_${s.index}.png`);
    await writeFile(f, buf);
    console.log(`  -> ${buf.length} bytes`);
    stitch.push({
      index: s.index,
      imageFile: f,
      clipStart: s.clipStart,
      clipEnd: s.clipEnd,
    });
  }

  const ff = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string);
  const audioFile = path.join(workDir, "audio.m4a");
  console.log("synthesizing test audio…");
  spawnSync(ff, ["-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=11", "-c:a", "aac", audioFile], {
    stdio: "ignore",
  });

  console.log("stitching…");
  const out = await stitchLyricsVideo({
    workDir,
    segments: stitch,
    audioFile,
    aspectRatio: "16:9",
    outFile: path.join(workDir, "out.mp4"),
  });
  const st = await stat(out);
  console.log(`\nOUTPUT: ${out}\nSIZE: ${(st.size / 1024).toFixed(1)} KB`);
  console.log("--- ffprobe ---");
  spawnSync(ff, ["-hide_banner", "-i", out], { stdio: "inherit" });
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
