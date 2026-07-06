import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "@clerk/clerk-react";
import { AlertCircle, Check, Code2, Copy, ExternalLink, Loader2, Maximize2, Music, Pause, Play, Share2 } from "lucide-react";
import type { AudioFeatures, Lyrics, PublicSong, SongLink } from "@syllary/shared";
import { captureClient } from "@/lib/analytics";
import { ApiError, getPublicSong, rateSong } from "@/lib/api";
import { useWavesurfer } from "@/hooks/use-wavesurfer";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { LogoWordmark } from "@/components/logo";
import { DynamicLyrics } from "@/components/result/dynamic-lyrics";
import { SyncedLyrics } from "@/components/result/synced-lyrics";
import { TheaterMode } from "@/components/result/theater-mode";
import { PublicDownloadRow } from "@/components/result/public-download-row";
import { ShowcaseAdmin } from "@/components/showcase-admin";
import { StarRating } from "@/components/result/star-rating";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { extractPalette } from "@/lib/palette";
import { platformMeta } from "@/lib/platforms";
import { useSeo } from "@/lib/seo";
import { authConfigured } from "@/lib/auth";
import { cn } from "@/lib/utils";

const FALLBACK_PALETTE = ["#FF2D2D", "#8B0000", "#D81818", "#4A0808"];

type LyricsMode = "dynamic" | "full";

function durationLabel(seconds: number | null): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isoDuration(seconds: number | null): string | undefined {
  if (seconds == null) return undefined;
  return `PT${Math.floor(seconds / 60)}M${Math.floor(seconds % 60)}S`;
}

/** Strip a trailing version digit (e.g. "Little puppy1" -> "Little puppy"). */
function cleanTitle(title: string): string {
  const stripped = title.replace(/\s*\d+$/, "").trim();
  return stripped || title;
}

function slug(title: string): string {
  return title.replace(/\.[a-z0-9]+$/i, "").replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "lyrics";
}

const LANG_NAMES: Record<string, string> = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
  nl: "Dutch", ja: "Japanese", ko: "Korean", zh: "Chinese", ru: "Russian", ar: "Arabic",
};
function languageName(code: string | null): string | null {
  if (!code) return null;
  return LANG_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

function Nav() {
  return (
    <nav className="sticky top-0 z-50 flex items-center justify-between border-b-[0.5px] border-white/[0.04] bg-void/85 px-6 py-4 backdrop-blur-xl sm:px-8">
      <Link to="/" aria-label="Syllary home">
        <LogoWordmark />
      </Link>
      <Link
        to="/"
        className="rounded-full bg-pulse px-5 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
      >
        Create your own
      </Link>
    </nav>
  );
}

export function PublicPage() {
  return authConfigured ? <PublicPageAuthAware /> : <PublicPageInner signedIn={false} />;
}

function PublicPageAuthAware() {
  const { isLoaded, isSignedIn } = useAuth();
  return <PublicPageInner signedIn={isLoaded && !!isSignedIn} />;
}

function PublicPageInner({ signedIn }: { signedIn: boolean }) {
  const { songId } = useParams<{ songId: string }>();
  const toast = useToast();
  const [song, setSong] = useState<PublicSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theaterOpen, setTheaterOpen] = useState(false);

  useEffect(() => {
    if (!songId) return;
    let active = true;
    getPublicSong(songId)
      .then((s) => {
        if (!active) return;
        setSong(s);
        captureClient("public_page_viewed", { song_id: songId });
      })
      .catch((e) => active && setError(e instanceof ApiError ? e.message : "This page isn't available."));
    return () => {
      active = false;
    };
  }, [songId]);

  const { containerRef, isPlaying, currentTime, playPause, seek } = useWavesurfer(song?.audioUrl ?? null);
  const [mode, setMode] = useState<LyricsMode>("dynamic");
  useEffect(() => {
    if (isPlaying) setMode("dynamic");
  }, [isPlaying]);

  const title = song ? cleanTitle(song.title) : "";
  const seo = useMemo(() => {
    if (!song) return null;
    const url = `${window.location.origin}/p/${song.id}`;
    const desc = `Listen to ${title}${song.artist ? ` by ${song.artist}` : ""} with word-by-word synced lyrics. Download in LRC, TTML, SRT, VTT and every format streaming platforms need.`;
    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "MusicRecording",
      name: title,
      url,
      ...(song.artist ? { byArtist: { "@type": "MusicGroup", name: song.artist } } : {}),
      ...(song.album ? { inAlbum: { "@type": "MusicAlbum", name: song.album } } : {}),
      ...(isoDuration(song.durationSeconds) ? { duration: isoDuration(song.durationSeconds) } : {}),
      ...(song.language ? { inLanguage: song.language } : {}),
      datePublished: song.createdAt.slice(0, 10),
    };
    return {
      title: `${title}${song.artist ? ` by ${song.artist}` : ""} — Synced Lyrics | Syllary`,
      description: desc,
      canonical: url,
      ogType: "music.song",
      image: song.coverUrl ?? undefined,
      jsonLd,
    };
  }, [song, title]);
  useSeo(seo);

  async function handleRate(stars: number) {
    if (!songId) return;
    try {
      const rating = await rateSong(songId, stars);
      setSong((s) => (s ? { ...s, rating } : s));
      toast("Thanks for rating!");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save your rating.", "error");
    }
  }

  if (error) {
    return (
      <main className="min-h-dvh bg-void text-white">
        <Nav />
        <div className="mx-auto flex min-h-[60vh] max-w-[880px] flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="mb-4 h-8 w-8 text-pulse" />
          <h1 className="text-[22px] font-medium">{error}</h1>
          <Link to="/" className="mt-6 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white">
            Go to Syllary
          </Link>
        </div>
      </main>
    );
  }

  if (!song) {
    return (
      <main className="min-h-dvh bg-void text-white">
        <Nav />
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-pulse" />
        </div>
      </main>
    );
  }

  const lyrics: Lyrics = song.lyrics ?? { language: null, lines: [] };
  const hasLyrics = lyrics.lines.length > 0;
  const language = languageName(song.language);

  const heroMeta = [
    song.album,
    song.year ? String(song.year) : null,
    song.genre,
    durationLabel(song.durationSeconds),
    language,
    lyrics.lines.length ? `${lyrics.lines.length} lines` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-dvh bg-void text-white">
      <Nav />

      <Hero
        title={title}
        artist={song.artist}
        coverUrl={song.coverUrl}
        meta={heroMeta}
        albumName={song.album}
        uploader={song.uploader}
      />

      <div className="mx-auto max-w-[880px] px-6 py-8 sm:px-8">
        <DataChips features={song.audioFeatures} />

        <ActionsRow songId={song.id} />

        {/* ====== PLAYER CARD ====== */}
        <div className="overflow-hidden rounded-[20px] border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0d0d0d_100%)] shadow-[0_24px_60px_rgba(0,0,0,0.4),0_0_80px_rgba(255,45,45,0.04)]">
          <div className="p-6 sm:p-7">
            <div className="mb-5 flex items-center gap-4">
              <button
                type="button"
                onClick={playPause}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] text-white shadow-[0_4px_20px_rgba(255,45,45,0.45)] transition-transform hover:scale-105"
              >
                {isPlaying ? (
                  <Pause className="h-5 w-5 fill-white" />
                ) : (
                  <Play className="ml-0.5 h-5 w-5 fill-white" />
                )}
              </button>
              <div ref={containerRef} className="min-w-0 flex-1" />
            </div>

            {hasLyrics && (
              <SectionTimeline
                lyrics={lyrics}
                durationSeconds={song.durationSeconds}
                currentTime={currentTime}
                onSeek={seek}
              />
            )}

            {hasLyrics ? (
              <>
                <div className="mb-5 flex items-center justify-end border-b border-white/[0.05] pb-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] uppercase tracking-[1.5px] text-white/40">View</span>
                    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#0a0a0a] p-0.5 text-[11px]">
                      {(["dynamic", "full"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setMode(m)}
                          className={cn(
                            "rounded-full px-3 py-1 capitalize transition-colors",
                            mode === m ? "bg-white text-[#0a0a0a]" : "text-white/55 hover:text-white",
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {mode === "dynamic" ? (
                  <DynamicLyrics lyrics={lyrics} currentTime={currentTime} onSeek={seek} align="left" />
                ) : (
                  <SyncedLyrics lyrics={lyrics} currentTime={currentTime} onSeek={seek} />
                )}

                <div className="mt-6 flex items-center justify-between gap-3 rounded-[12px] border border-dashed border-pulse/30 px-5 py-4">
                  <span className="text-[14px] text-white/70">Want this for your own track?</span>
                  <Link to="/" className="text-[14px] font-medium text-[#FF6B6B] hover:underline">
                    Upload free →
                  </Link>
                </div>
              </>
            ) : (
              <p className="py-12 text-center text-[15px] text-white/40">
                No lyrics were detected in this track.
              </p>
            )}
          </div>

          {hasLyrics && (
            <div className="border-t border-white/[0.06] bg-black/20 px-6 py-5 sm:px-7">
              <h2 className="mb-3 text-[11px] uppercase tracking-[1.8px] text-white/40">
                Download for every platform
              </h2>
              <PublicDownloadRow lyrics={lyrics} baseName={slug(title)} />
            </div>
          )}
        </div>

        {song.lyricVideoUrl && (
          <div className="mt-6 overflow-hidden rounded-[16px] border-[0.5px] border-white/[0.06] bg-[#0d0d0d] p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[11px] uppercase tracking-[1.8px] text-white/40">Lyric video</h2>
              <div className="flex items-center gap-2">
                {songId && <ShowcaseAdmin songId={songId} signedIn={signedIn} />}
                <button
                  type="button"
                  onClick={() => setTheaterOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-pulse" />
                  Theater
                </button>
              </div>
            </div>
            <video
              src={song.lyricVideoUrl}
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              playsInline
              crossOrigin="anonymous"
              className="aspect-video w-full overflow-hidden rounded-[12px] border border-white/10 bg-black"
            />
            <TheaterMode
              open={theaterOpen}
              src={song.lyricVideoUrl}
              title={song.title}
              onClose={() => setTheaterOpen(false)}
            />
          </div>
        )}

        {song.links.length > 0 && <ListenOn links={song.links} />}

        {song.insights && <AboutCard insights={song.insights} language={language} />}

        <div className="mt-6 rounded-[16px] border-[0.5px] border-white/[0.06] bg-[#0d0d0d] px-6 py-6 text-center">
          <h2 className="mb-4 text-[14px] font-medium text-white">Rate this track</h2>
          <StarRating summary={song.rating} canRate={signedIn} onRate={handleRate} />
        </div>

        {song.moreFromUploader.length > 0 && song.uploader && (
          <MoreFromUploader name={song.uploader.name} items={song.moreFromUploader} />
        )}

        <footer className="mt-10 text-center text-[12px] text-white/30">
          Made with{" "}
          <Link to="/" className="text-white/50 hover:text-white">
            Syllary
          </Link>{" "}
          — synced lyrics for every platform.
        </footer>
      </div>
    </main>
  );
}

function Hero({
  title,
  artist,
  coverUrl,
  meta,
  albumName,
  uploader,
}: {
  title: string;
  artist: string | null;
  coverUrl: string | null;
  meta: string[];
  albumName: string | null;
  uploader: { name: string } | null;
}) {
  const reduced = usePrefersReducedMotion();
  const [palette, setPalette] = useState<string[]>(FALLBACK_PALETTE);

  // Mouse parallax: nudge the whole aurora field toward the cursor.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 60, damping: 18 });
  const py = useSpring(my, { stiffness: 60, damping: 18 });

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    if (reduced) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 44);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 30);
  }
  function onMouseLeave() {
    mx.set(0);
    my.set(0);
  }

  useEffect(() => {
    if (!coverUrl) {
      setPalette(FALLBACK_PALETTE);
      return;
    }
    let active = true;
    extractPalette(coverUrl).then((p) => {
      if (active) setPalette(p && p.length >= 2 ? p : FALLBACK_PALETTE);
    });
    return () => {
      active = false;
    };
  }, [coverUrl]);

  // Generative aurora: soft color blobs drawn from the album-art palette,
  // screen-blended and slowly drifting. Falls back to a red palette.
  const blobs = [
    { color: palette[0]!, top: "-15%", left: "-5%", w: "60%", h: "85%", dur: 17 },
    { color: palette[1] ?? palette[0]!, top: "10%", left: "45%", w: "65%", h: "90%", dur: 21 },
    { color: palette[2] ?? palette[0]!, top: "30%", left: "15%", w: "55%", h: "75%", dur: 25 },
    { color: palette[3] ?? palette[1] ?? palette[0]!, top: "-25%", left: "70%", w: "50%", h: "80%", dur: 19 },
  ];

  return (
    <section
      className="relative w-full overflow-hidden border-b-[0.5px] border-white/[0.04] bg-[#0c0303]"
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* Generative aurora from album-art colors */}
      <motion.div aria-hidden className="absolute inset-0" style={{ x: px, y: py }}>
        {blobs.map((b, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              top: b.top,
              left: b.left,
              width: b.w,
              height: b.h,
              background: b.color,
              filter: "blur(75px)",
              mixBlendMode: "screen",
              opacity: 0.62,
            }}
            animate={
              reduced
                ? undefined
                : { x: [0, 28, -22, 0], y: [0, -26, 18, 0], scale: [1, 1.18, 0.9, 1] }
            }
            transition={reduced ? undefined : { duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </motion.div>

      {/* Soft highlight + bottom fade to ground the colors (keeps the top vivid) */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 35% 35%, rgba(255,255,255,0.08) 0%, transparent 55%), linear-gradient(180deg, rgba(10,10,10,0.18) 0%, transparent 28%, transparent 62%, #0A0A0A 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-[3] mx-auto flex min-h-[360px] max-w-[880px] flex-col items-start gap-5 px-6 pb-9 pt-12 sm:flex-row sm:items-end sm:gap-7 sm:px-8">
        <div className="h-[150px] w-[150px] shrink-0 overflow-hidden rounded-[14px] border-[0.5px] border-white/15 shadow-[0_24px_56px_rgba(0,0,0,0.65),0_4px_18px_rgba(220,30,30,0.3)] sm:h-[180px] sm:w-[180px]">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={`${title} cover`}
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#FF2D2D_0%,#8B0000_100%)]">
              <Music className="h-10 w-10 text-white/80" />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 pb-1.5">
          <div className="mb-3.5 text-[11px] uppercase tracking-[1.3px] text-white/55">
            <Link to="/" className="hover:text-white">
              Home
            </Link>
            {artist && (
              <>
                <span className="mx-2.5 text-white/30">›</span>
                <span>{artist}</span>
              </>
            )}
            <span className="mx-2.5 text-white/30">›</span>
            <span className="text-white/80">{title}</span>
          </div>

          {uploader && (
            <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border-[0.5px] border-white/10 bg-white/[0.06] py-1 pl-1 pr-3">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FF2D2D_0%,#8B0000_100%)] text-[10px] font-medium text-white">
                {uploader.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <span className="text-[11px] text-white/55">Uploaded by</span>
              <span className="text-[11px] font-medium text-white">{uploader.name}</span>
            </div>
          )}

          <h1 className="mb-3 text-[clamp(30px,6vw,46px)] font-medium leading-[1.05] tracking-[-1.6px]">
            {title}
            {artist && (
              <>
                {" "}
                <span className="font-normal text-white/70">by</span>{" "}
                <span className="text-white">{artist}</span>
              </>
            )}
            <span className="mt-1 block text-[clamp(18px,3.5vw,26px)] font-normal tracking-[-0.8px] text-white/50">
              Synced lyrics
            </span>
          </h1>

          {meta.length > 0 && (
            <div className="flex flex-wrap items-center text-[13px] text-white/70">
              {meta.map((item, i) => (
                <span key={i} className="flex items-center">
                  {i > 0 && <span className="mx-2.5 text-white/30">·</span>}
                  <span className={item === albumName ? "font-medium text-white" : ""}>{item}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type Seg = { label: string; start: number; end: number };

function sectionSegments(lyrics: Lyrics, durationSeconds: number | null): Seg[] {
  const segs: Seg[] = [];
  for (const line of lyrics.lines) {
    if (line.section) {
      if (segs.length) segs[segs.length - 1]!.end = line.start;
      segs.push({ label: line.section, start: line.start, end: line.start });
    }
  }
  if (segs.length === 0) return [];
  segs[0]!.start = 0;
  const songEnd = Math.max(durationSeconds ?? 0, lyrics.lines.at(-1)?.end ?? 0, segs[segs.length - 1]!.start + 1);
  segs[segs.length - 1]!.end = songEnd;
  return segs;
}

/** Compact section label for narrow screens — "Verse 2" → "V2", "Chorus" → "C",
 *  "Pre-Chorus" → "PC", "Outro" → "O". Full words don't fit the structure bar on
 *  mobile; the full name stays in the button's title tooltip + the playing badge. */
function abbreviateSection(label: string): string {
  const l = label.toLowerCase();
  const num = l.match(/(\d+)\s*$/)?.[1] ?? "";
  if (l.includes("pre")) return `PC${num}`;
  if (l.includes("chorus")) return `C${num}`;
  if (l.includes("verse")) return `V${num}`;
  if (l.includes("bridge")) return `B${num}`;
  if (l.includes("hook")) return `H${num}`;
  if (l.includes("refrain")) return `R${num}`;
  if (l.includes("intro")) return "I";
  if (l.includes("outro")) return "O";
  const word = l.replace(/[^a-z]/g, "").slice(0, 3).toUpperCase();
  return `${word}${num}` || label;
}

function segColor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("pre")) return "rgba(200,100,80,0.2)";
  if (l.includes("chorus") || l.includes("hook") || l.includes("refrain")) return "rgba(255,45,45,0.25)";
  if (l.includes("verse")) return "rgba(180,80,80,0.2)";
  if (l.includes("bridge")) return "rgba(180,80,140,0.2)";
  if (l.includes("intro") || l.includes("outro")) return "rgba(120,120,120,0.15)";
  return "rgba(150,90,90,0.18)";
}

function SectionTimeline({
  lyrics,
  durationSeconds,
  currentTime,
  onSeek,
}: {
  lyrics: Lyrics;
  durationSeconds: number | null;
  currentTime: number;
  onSeek: (s: number) => void;
}) {
  const segs = useMemo(() => sectionSegments(lyrics, durationSeconds), [lyrics, durationSeconds]);
  if (segs.length === 0) return null;

  return (
    <div className="mb-5">
      <div className="mb-2.5 text-[10px] uppercase tracking-[1.2px] text-white/40">
        Song structure · click to jump
      </div>
      <div className="flex h-7 overflow-hidden rounded-[6px] border-[0.5px] border-white/[0.06] bg-white/[0.03]">
        {segs.map((seg, i) => {
          const active = currentTime >= seg.start && currentTime < seg.end;
          const weight = Math.max(seg.end - seg.start, 0.5);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSeek(seg.start)}
              title={`${seg.label} · ${durationLabel(Math.round(seg.start))}`}
              className="flex h-full min-w-[22px] items-center justify-center overflow-hidden whitespace-nowrap border-r-[0.5px] border-black/40 px-1 text-[10px] font-medium uppercase tracking-[0.3px] transition-[filter] last:border-r-0 hover:brightness-125 sm:min-w-[34px] sm:px-1.5"
              style={{
                flexGrow: weight,
                flexBasis: 0,
                backgroundColor: segColor(seg.label),
                color: active ? "#FF6B6B" : "rgba(255,255,255,0.6)",
                boxShadow: active ? "inset 0 -2px 0 #FF2D2D" : undefined,
              }}
            >
              {/* Abbreviated on mobile (no room for full words), full on desktop. */}
              <span className="sm:hidden">{abbreviateSection(seg.label)}</span>
              <span className="hidden sm:inline">{seg.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DataChips({ features }: { features: AudioFeatures | null }) {
  if (!features) return null;
  const chips: ReactNode[] = [];
  const baseChip =
    "inline-flex items-center gap-2 rounded-full border-[0.5px] border-white/[0.08] bg-stage px-3 py-1.5 font-mono text-[12px] text-white/85";
  const label = "text-[10px] uppercase tracking-[0.5px] text-white/40";
  const bar = (v: number) => (
    <span className="relative h-1 w-9 overflow-hidden rounded-full bg-white/10">
      <span className="absolute inset-y-0 left-0 rounded-full bg-pulse" style={{ width: `${Math.round(v * 100)}%` }} />
    </span>
  );

  if (features.bpm != null)
    chips.push(<span key="bpm" className={baseChip}><span className={label}>BPM</span>{Math.round(features.bpm)}</span>);
  if (features.key)
    chips.push(<span key="key" className={baseChip}><span className={label}>Key</span>{features.key}</span>);
  if (features.timeSignature)
    chips.push(<span key="time" className={baseChip}><span className={label}>Time</span>{features.timeSignature}</span>);
  if (features.energy != null)
    chips.push(<span key="energy" className={baseChip}><span className={label}>Energy</span>{bar(features.energy)}</span>);
  if (features.danceability != null)
    chips.push(<span key="dance" className={baseChip}><span className={label}>Dance</span>{bar(features.danceability)}</span>);

  if (chips.length === 0) return null;
  return <div className="mb-5 flex flex-wrap items-center gap-2">{chips}</div>;
}

function ActionsRow({ songId }: { songId: string }) {
  const toast = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [copied, setCopied] = useState<"link" | "embed" | null>(null);

  const shareUrl = `${window.location.origin}/p/${songId}`;
  const embedCode = `<iframe src="${window.location.origin}/embed/${songId}" width="100%" height="220" frameborder="0" style="border-radius:12px" loading="lazy"></iframe>`;

  async function copy(value: string, which: "link" | "embed") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      toast("Couldn't copy.", "error");
    }
  }

  const btn =
    "inline-flex items-center gap-2 rounded-[10px] border-[0.5px] border-white/10 bg-stage px-4 py-2.5 text-[13px] text-white transition-colors hover:border-white/25";

  return (
    <>
      <div className="mb-7 flex items-center gap-2.5">
        <button type="button" className={btn} onClick={() => setShareOpen(true)}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
        <button type="button" className={btn} onClick={() => setEmbedOpen(true)}>
          <Code2 className="h-3.5 w-3.5" /> Embed
        </button>
      </div>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this track">
        <p className="mb-3 text-[13px] text-white/50">Anyone with this link can view the synced lyrics.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={shareUrl} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/80 outline-none" />
          <button type="button" onClick={() => void copy(shareUrl, "link")} className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-pulse px-3 py-2 text-[12px] font-medium text-white transition-transform hover:scale-[1.03]">
            {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "link" ? "Copied" : "Copy"}
          </button>
        </div>
      </Modal>

      <Modal open={embedOpen} onClose={() => setEmbedOpen(false)} title="Embed this player" widthClass="max-w-[560px]">
        <p className="mb-3 text-[13px] text-white/50">Paste this into your site to embed the lyric player.</p>
        <textarea readOnly value={embedCode} onFocus={(e) => e.currentTarget.select()} className="h-24 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 p-3 font-mono text-[12px] text-white/80 outline-none" />
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={() => void copy(embedCode, "embed")} className="inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]">
            {copied === "embed" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied === "embed" ? "Copied" : "Copy code"}
          </button>
        </div>
      </Modal>
    </>
  );
}

function ListenOn({ links }: { links: SongLink[] }) {
  return (
    <div className="mt-6 rounded-[16px] border-[0.5px] border-white/[0.06] bg-[#0d0d0d] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-pulse" />
        <h2 className="text-[14px] font-medium text-white">Listen on</h2>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {links.map((link) => {
          const meta = platformMeta(link.platform);
          return (
            <a
              key={link.platform + link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2 rounded-full border-[0.5px] border-white/10 bg-stage px-4 py-2.5 text-[13px] text-white transition-colors hover:border-white/25"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
              {meta.label}
              <ExternalLink className="h-3 w-3 text-white/30 transition-colors group-hover:text-white/60" />
            </a>
          );
        })}
      </div>
    </div>
  );
}

function AboutCard({
  insights,
  language,
}: {
  insights: NonNullable<PublicSong["insights"]>;
  language: string | null;
}) {
  return (
    <div className="mt-6 rounded-[16px] border-[0.5px] border-white/[0.06] bg-[#0d0d0d] p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-pulse" />
        <h2 className="text-[14px] font-medium text-white">About this song</h2>
      </div>

      <p className="mb-4 text-[14px] leading-[1.7] text-white/75">{insights.summary}</p>

      {insights.themes.length > 0 && (
        <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="min-w-[80px] text-[11px] text-white/40">Themes</span>
          {insights.themes.map((t) => (
            <span key={t} className="rounded-full border-[0.5px] border-white/[0.08] bg-white/[0.05] px-2.5 py-1 text-[11px] text-white/75">
              {t}
            </span>
          ))}
        </div>
      )}

      {insights.mood && (
        <div className="mb-2.5 flex flex-wrap items-center gap-3 text-[12px]">
          <span className="min-w-[80px] text-[11px] text-white/40">Mood</span>
          <span className="text-[13px] text-white/70">{insights.mood}</span>
        </div>
      )}

      {language && (
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="min-w-[80px] text-[11px] text-white/40">Language</span>
          <span className="text-[13px] text-white/70">{language}</span>
        </div>
      )}

      <div className="mt-4 border-t-[0.5px] border-white/[0.04] pt-3.5 text-[10px] tracking-[0.3px] text-white/30">
        Summary generated by AI from the song's lyrics.
      </div>
    </div>
  );
}

function MoreFromUploader({ name, items }: { name: string; items: PublicSong["moreFromUploader"] }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FF2D2D_0%,#8B0000_100%)] text-[14px] font-medium text-white">
          {initial}
        </span>
        <div>
          <div className="text-[14px] font-medium text-white">More from {name}</div>
          <div className="text-[11px] text-white/40">
            {items.length} more public {items.length === 1 ? "track" : "tracks"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.id}
            to={`/p/${item.id}`}
            className="rounded-[12px] border-[0.5px] border-white/[0.06] bg-stage p-3 transition-colors hover:border-pulse/30"
          >
            <div className="mb-2.5 aspect-square w-full overflow-hidden rounded-[8px] bg-[#2a0606]">
              {item.coverUrl ? (
                <img src={item.coverUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <FallbackArt seed={item.id} />
              )}
            </div>
            <div className="truncate text-[13px] font-medium text-white">{cleanTitle(item.title)}</div>
            <div className="text-[11px] text-white/40">{durationLabel(item.durationSeconds)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function FallbackArt({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 15 }, () => {
      h = (h * 1103515245 + 12345) >>> 0;
      return 0.25 + ((h % 1000) / 1000) * 0.72;
    });
  }, [seed]);
  return (
    <span className="flex h-full w-full items-end gap-[2px] bg-[linear-gradient(135deg,#2a0606_0%,#150303_100%)] p-3">
      {bars.map((b, i) => (
        <span key={i} className="flex-1 rounded-[1px] bg-pulse/55" style={{ height: `${Math.max(8, Math.min(100, b * 100))}%` }} />
      ))}
    </span>
  );
}
