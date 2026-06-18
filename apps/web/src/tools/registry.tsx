import { lazy, Suspense, type ComponentType } from "react";
import { Loader2 } from "lucide-react";

/** Registry of mini-tools that landing pages mount by key. Each tool is a small,
 *  single-purpose, client-side surface off the same lyrics engine (SYLLARY.md
 *  §13). Components are code-split so a content page never pays for tool JS. */

export type ToolDef = {
  key: string;
  /** Human name (used in the admin editor's tool dropdown). */
  name: string;
  /** One-line description of what the tool does. */
  blurb: string;
  component: ComponentType;
};

const lazyTool = (loader: () => Promise<{ default: ComponentType }>) => lazy(loader);

export const TOOL_REGISTRY: Record<string, ToolDef> = {
  "format-converter": {
    key: "format-converter",
    name: "Lyrics format converter",
    blurb: "Convert between .lrc, .ttml, .srt, .vtt, .txt and .json.",
    component: lazyTool(() =>
      import("./format-converter").then((m) => ({ default: m.FormatConverter })),
    ),
  },
  "lrc-validator": {
    key: "lrc-validator",
    name: "LRC validator",
    blurb: "Check an .lrc file for malformed or out-of-order timestamps.",
    component: lazyTool(() => import("./lrc-validator").then((m) => ({ default: m.LrcValidator }))),
  },
  "lrc-offset-adjuster": {
    key: "lrc-offset-adjuster",
    name: "LRC offset adjuster",
    blurb: "Shift every timestamp in an .lrc by a fixed millisecond offset.",
    component: lazyTool(() =>
      import("./lrc-offset-adjuster").then((m) => ({ default: m.LrcOffsetAdjuster })),
    ),
  },
  "plain-lyrics-extractor": {
    key: "plain-lyrics-extractor",
    name: "Plain lyrics extractor",
    blurb: "Strip timing and markup from a lyrics file to clean text.",
    component: lazyTool(() =>
      import("./plain-lyrics-extractor").then((m) => ({ default: m.PlainLyricsExtractor })),
    ),
  },
  "lyrics-word-counter": {
    key: "lyrics-word-counter",
    name: "Lyrics word counter",
    blurb: "Count words, unique words, lines and characters in lyrics.",
    component: lazyTool(() =>
      import("./lyrics-word-counter").then((m) => ({ default: m.LyricsWordCounter })),
    ),
  },
  "lyrics-preview-player": {
    key: "lyrics-preview-player",
    name: "Synced lyrics preview player",
    blurb: "Paste synced lyrics + your audio for a karaoke-style preview.",
    component: lazyTool(() =>
      import("./lyrics-preview-player").then((m) => ({ default: m.LyricsPreviewPlayer })),
    ),
  },
  "lyric-timestamp-viewer": {
    key: "lyric-timestamp-viewer",
    name: "Lyric timestamp viewer",
    blurb: "See every line's exact timestamp against the waveform.",
    component: lazyTool(() =>
      import("./lyric-timestamp-viewer").then((m) => ({ default: m.LyricTimestampViewer })),
    ),
  },
  "lrc-editor": {
    key: "lrc-editor",
    name: "LRC editor (online)",
    blurb: "Edit an .lrc with a live karaoke preview and download.",
    component: lazyTool(() => import("./lrc-editor").then((m) => ({ default: m.LrcEditor }))),
  },
  "duration-silence-detector": {
    key: "duration-silence-detector",
    name: "Duration & lead-in silence detector",
    blurb: "Get an audio file's exact duration and lead-in silence.",
    component: lazyTool(() =>
      import("./duration-silence-detector").then((m) => ({ default: m.DurationSilenceDetector })),
    ),
  },
  "streaming-link-finder": {
    key: "streaming-link-finder",
    name: "Streaming link finder",
    blurb: "Find every streaming link from a title/artist or a pasted URL.",
    component: lazyTool(() =>
      import("./streaming-link-finder").then((m) => ({ default: m.StreamingLinkFinder })),
    ),
  },
  "song-summary-generator": {
    key: "song-summary-generator",
    name: "Song summary generator",
    blurb: "Turn lyrics into a summary, themes, and mood.",
    component: lazyTool(() =>
      import("./song-summary-generator").then((m) => ({ default: m.SongSummaryGenerator })),
    ),
  },
  "find-the-chorus": {
    key: "find-the-chorus",
    name: "Find the chorus",
    blurb: "Label a song's sections and highlight the chorus.",
    component: lazyTool(() => import("./find-the-chorus").then((m) => ({ default: m.FindTheChorus }))),
  },
  "demo-lyric-video": {
    key: "demo-lyric-video",
    name: "Instant lyric video demo",
    blurb: "Make a 10-second sample lyric video — pick a style, no upload needed.",
    component: lazyTool(() =>
      import("./demo-lyric-video").then((m) => ({ default: m.DemoLyricVideo })),
    ),
  },
};

export const TOOL_LIST: ToolDef[] = Object.values(TOOL_REGISTRY);

/** Mount a tool by key (used by the landing template for `toolEmbed`/tool pages). */
export function ToolHost({ toolKey }: { toolKey: string }) {
  const tool = TOOL_REGISTRY[toolKey];
  if (!tool) {
    return (
      <p className="rounded-xl border border-white/[0.08] bg-stage px-4 py-3 text-[13px] text-white/55">
        This tool isn&apos;t available.
      </p>
    );
  }
  const Tool = tool.component;
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-stage px-4 py-6 text-[13px] text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading tool…
        </div>
      }
    >
      <Tool />
    </Suspense>
  );
}
