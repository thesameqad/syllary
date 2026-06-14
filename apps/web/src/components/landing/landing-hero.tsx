import { Check, Download, FileAudio, Film, Share2, Wand2 } from "lucide-react";
import { LANDING_CATEGORIES, type LandingPage } from "@syllary/shared";
import { UploadCard } from "./upload-card";

/** Conversion hero for SEO/ad landing pages. A first-time visitor (especially
 *  from a paid click) sees the value prop, a 3-step "how it works", the real
 *  upload box, and — on video-intent pages — the same example clips as the home
 *  page. The original guide content still renders below for SEO depth. */

type Track = "video" | "public" | "files";

/** Pick the hero framing from the page's slug + title. */
function trackOf(page: LandingPage): Track {
  const s = `${page.slug} ${page.title}`.toLowerCase();
  if (/video/.test(s)) return "video";
  if (/public|shareable|share your|page for your|lyrics page/.test(s)) return "public";
  return "files";
}

const SUBHEAD: Record<Track, string> = {
  video:
    "Upload your song and Syllary turns it into a synced lyric video in a few clicks. The AI paints a scene for every line. Pick a style, preview it, and you're done.",
  public:
    "Upload your song and get a beautiful public page with synced lyrics you can share anywhere, plus every lyric file format the platforms use.",
  files:
    "Upload your track and get every synced lyric file the platforms need, from .lrc to .ttml, .srt and .vtt, in about a minute.",
};

const STEPS: Record<Track, { icon: typeof FileAudio; title: string; text: string }[]> = {
  files: [
    { icon: FileAudio, title: "Upload your track", text: "MP3, WAV, or FLAC. No sign-up needed to try." },
    { icon: Wand2, title: "AI syncs every line", text: "Word-by-word timing, with a built-in editor to fix anything." },
    { icon: Download, title: "Download every format", text: ".lrc, .ttml, .srt, .vtt, .txt and .json, ready to ship." },
  ],
  video: [
    { icon: FileAudio, title: "Upload your song", text: "MP3, WAV, or FLAC. No sign-up needed to try." },
    { icon: Wand2, title: "AI syncs the lyrics", text: "Then you choose a look: Slideshow, Living Scenes, or Cinematic." },
    { icon: Film, title: "Get your lyric video", text: "A finished 1080p MP4, ready for YouTube." },
  ],
  public: [
    { icon: FileAudio, title: "Upload your song", text: "MP3, WAV, or FLAC. No sign-up needed to try." },
    { icon: Wand2, title: "AI syncs the lyrics", text: "Word-by-word, with a karaoke-style player." },
    { icon: Share2, title: "Publish your page", text: "A shareable public page for your music, in one click." },
  ],
};

const VIDEO_STYLES = [
  { model: "fast", label: "Slideshow", tagline: "Still scenes, gentle drift" },
  { model: "normal", label: "Living Scenes", tagline: "The whole world moves" },
  { model: "pro", label: "Cinematic", tagline: "A real music video" },
] as const;

function categoryLabel(category: LandingPage["category"]): string {
  return LANDING_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

export function LandingHero({ page }: { page: LandingPage }) {
  const track = trackOf(page);
  const steps = STEPS[track];

  return (
    <section className="relative overflow-hidden border-b border-white/[0.06] bg-void">
      {/* ambient red glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,45,45,0.10),transparent)]"
      />
      <div className="relative mx-auto max-w-6xl px-5 py-12 md:py-16">
        <p className="mb-3 text-[12px] uppercase tracking-[0.18em] text-pulse/80">
          {categoryLabel(page.category)}
        </p>

        <div className="grid items-start gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-12">
          {/* Left: value prop + how-it-works */}
          <div>
            <h1 className="text-[34px] font-medium leading-[1.08] tracking-[-1px] text-white md:text-[44px]">
              {page.title}
            </h1>
            <p className="mt-4 max-w-[540px] text-[17px] leading-[1.6] text-white/60">
              {SUBHEAD[track]}
            </p>

            <div className="mt-8 space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-[0.5px] border-white/10 bg-stage">
                    <s.icon className="h-4 w-4 text-pulse" />
                  </span>
                  <div>
                    <div className="text-[15px] font-medium text-white">
                      <span className="mr-1.5 text-white/35">{i + 1}.</span>
                      {s.title}
                    </div>
                    <div className="mt-0.5 text-[14px] leading-relaxed text-white/55">{s.text}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/45">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> Free to try
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> No sign-up
              </span>
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> Ready in about a minute
              </span>
            </div>
          </div>

          {/* Right: the real upload box */}
          <div id="start" className="scroll-mt-20">
            <UploadCard />
          </div>
        </div>

        {/* Video-intent pages: the same example clips as the home page */}
        {track === "video" && (
          <div className="mt-14">
            <p className="mb-5 text-center text-[14px] text-white/55">
              Three styles, built from your lyrics. Here&apos;s what they look like:
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {VIDEO_STYLES.map((s) => (
                <div
                  key={s.model}
                  className="overflow-hidden rounded-[14px] border-[0.5px] border-white/10 bg-stage"
                >
                  <div className="aspect-video w-full bg-black">
                    <video
                      src={`/format-previews/${s.model}.mp4`}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-[14px] font-medium text-white">{s.label}</div>
                    <div className="text-[12px] text-pulse/80">{s.tagline}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
