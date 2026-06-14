import type { FaqItem } from "@syllary/shared";
import type { SeedPage } from "./types.js";

/** Every landing page should show at least 3 FAQs — a single one looks sparse
 *  and weakens the FAQPage schema. Pages keep their own authored FAQs; this
 *  tops them up from track-aware pools (deduped by question, rotated by slug so
 *  neighbouring pages don't show an identical set). Answers are accurate to what
 *  Syllary actually does and contain no banned vendor strings. */

type Track = "video" | "public" | "tool" | "files";

function trackOf(p: SeedPage): Track {
  const s = `${p.slug} ${p.title}`.toLowerCase();
  if (p.renderType === "tool") return "tool";
  if (/video/.test(s)) return "video";
  if (/public|shareable|share your|page for your|lyrics page/.test(s)) return "public";
  return "files";
}

const UNIVERSAL: FaqItem[] = [
  {
    q: "Is it free to try?",
    a: "Yes. You can do one song with no sign-up, up to three minutes long. Make a free account for more, or pick a plan when you're ready.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. Syllary runs in your browser. Upload an MP3, WAV, or FLAC and everything happens online.",
  },
  {
    q: "Do I have to type the lyrics myself?",
    a: "No. Syllary transcribes the lyrics from your audio and times every line. You can fix any word in the editor.",
  },
  {
    q: "How long does it take?",
    a: "Most songs are transcribed and synced in about a minute.",
  },
  {
    q: "What audio files can I upload?",
    a: "MP3, WAV, or FLAC, up to 60 MB.",
  },
  {
    q: "Can I edit the result?",
    a: "Yes. A built-in editor lets you correct any word or nudge the timing, and you can re-run in a different mode if a line is tricky.",
  },
];

const FILES: FaqItem[] = [
  {
    q: "Which lyric formats do I get?",
    a: "Every upload exports .lrc, enhanced word-level .lrc, .ttml, .srt, .vtt, .txt, and .json.",
  },
  {
    q: "What's the difference between LRC and enhanced LRC?",
    a: "Standard LRC times each line. Enhanced LRC times each word, so a player can highlight word by word.",
  },
  {
    q: "Can I use the files for karaoke and video captions?",
    a: "Yes. LRC drives karaoke-style players, and SRT or VTT work as captions in video tools and players.",
  },
  {
    q: "Will it catch repeated chorus lines?",
    a: "Yes. Repeated lines like a chorus are transcribed and timed each time they occur, not just once.",
  },
  {
    q: "Can I shift the timing if it's slightly early or late?",
    a: "Yes. You can offset every timestamp at once or nudge individual lines in the editor.",
  },
  {
    q: "Where can I use the lyric files?",
    a: "In media players, karaoke apps, and video editors, and alongside a release where your distributor accepts a lyrics file.",
  },
];

const VIDEO: FaqItem[] = [
  {
    q: "What video styles can I choose?",
    a: "Three: Slideshow (still scenes with gentle motion), Living Scenes (the whole scene moves), and Cinematic (a continuous, music-video feel).",
  },
  {
    q: "What resolution is the video?",
    a: "1080p MP4, ready to upload to YouTube or share anywhere.",
  },
  {
    q: "Can I preview before making the full video?",
    a: "Yes. You can preview a short sample of your chosen style before committing to the full render.",
  },
  {
    q: "Do I need any video editing skills?",
    a: "No. Pick a style and Syllary builds a scene for every line automatically.",
  },
  {
    q: "Can I make a video for an AI-generated song?",
    a: "Yes. Upload the track, Syllary syncs the lyrics, then builds the video, whether the song is yours or AI-made.",
  },
  {
    q: "Can I change the art direction of the scenes?",
    a: "Yes. You can guide the look with a short style description, and regenerate a scene you don't like.",
  },
];

const PUBLIC: FaqItem[] = [
  {
    q: "What is the public song page?",
    a: "A shareable page for your song with synced, karaoke-style lyrics, cover art, and links, all at its own URL.",
  },
  {
    q: "Can I share it anywhere?",
    a: "Yes. The page has a public link you can post on social, send to fans, or embed elsewhere.",
  },
  {
    q: "Does it work for AI-generated songs?",
    a: "Yes. Upload the track and you get the page, the synced lyrics, and every lyric file, whether the song is yours or AI-made.",
  },
  {
    q: "Do I need an account for a public page?",
    a: "Yes, a free account, so the page is saved to your library and you can update or unpublish it anytime.",
  },
];

const TOOL: FaqItem[] = [
  {
    q: "Is this tool free?",
    a: "Yes, this tool is free to use right in your browser.",
  },
  {
    q: "Do I need an account?",
    a: "No account needed for the free tools here. You only sign up when you want to generate synced lyrics or a lyric video from a full song.",
  },
  {
    q: "What else can Syllary do?",
    a: "Upload a track to get every synced lyric format (.lrc, .ttml, .srt, .vtt and more), a shareable lyrics page, and a lyric video.",
  },
];

const POOLS: Record<Track, FaqItem[]> = { files: FILES, video: VIDEO, public: PUBLIC, tool: TOOL };

export function ensureMinFaqs(p: SeedPage, min = 3): FaqItem[] {
  const out: FaqItem[] = [...(p.faq ?? [])];
  const seen = new Set(out.map((f) => f.q.toLowerCase().trim()));
  // Stable per-slug rotation so adjacent pages don't all surface the same items.
  const h = [...p.slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rotate = <T>(arr: T[]): T[] => arr.map((_, i) => arr[(i + h) % arr.length]!);
  const candidates = [...rotate(POOLS[trackOf(p)]), ...rotate(UNIVERSAL)];
  for (const c of candidates) {
    if (out.length >= min) break;
    const key = c.q.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
