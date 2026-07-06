/* Sanity: "single" grouping plan + cost vs "time" on a synthetic 4-min song. */
import {
  buildPreviewSegments,
  buildSegments,
  estimateVideoCost,
  type Lyrics,
} from "@syllary/shared";

const lines = Array.from({ length: 40 }, (_, i) => ({
  text: `Lyric line number ${i + 1} of the song`,
  start: 12 + i * 5.5,
  end: 12 + i * 5.5 + 4.2,
  section: i % 8 === 0 ? "Verse" : null,
}));
const lyrics = { lines } as unknown as Lyrics;
const duration = 250;

for (const g of ["time", "single"] as const) {
  const segs = buildSegments(lyrics, duration, g);
  const est = estimateVideoCost({
    model: "normal",
    quality: "fast",
    imageSize: "1K",
    lyrics,
    durationSeconds: duration,
    sceneGrouping: g,
  });
  console.log(
    `${g}: scenes=${segs.length} span=[${segs[0]!.clipStart}-${segs[segs.length - 1]!.clipEnd}] ` +
      `lines0=${segs[0]!.lines?.length ?? 0} textMode0=${segs[0]!.textMode ?? "-"} ` +
      `clipSeconds=${est.clipSeconds} plates=${est.plates} tokens=${est.tokens}`,
  );
}
const prev = buildPreviewSegments(lyrics, duration, "single");
console.log(
  `single preview: scenes=${prev.segments.length} lines=${prev.segments[0]?.lines?.length} ` +
    `textMode=${prev.segments[0]?.textMode} window=[${prev.segments[0]?.clipStart}-${prev.segments[0]?.clipEnd}]`,
);
const prevEst = estimateVideoCost({
  model: "normal",
  quality: "fast",
  imageSize: "1K",
  lyrics,
  durationSeconds: duration,
  preview: true,
  sceneGrouping: "single",
});
console.log(`single preview tokens=${prevEst.tokens} (flat expected)`);
