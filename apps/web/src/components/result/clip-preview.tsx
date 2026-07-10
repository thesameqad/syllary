import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Film, Paintbrush, Pause, Play } from "lucide-react";
import type { ReviewSegment } from "@syllary/shared";
import { cn } from "@/lib/utils";

// Shared building blocks for scene editing, used by BOTH the inline manual
// review (components/result/manual-review.tsx) and the full-page Video Editor
// (pages/video-editor-page.tsx). Extracted verbatim from manual-review.

export const FIELD =
  "mt-1.5 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[12px] leading-relaxed text-white/85 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/60 focus:bg-pulse/[0.04] disabled:opacity-50";

/** What the motion field shows for a scene: the saved motion direction if there is
 *  one (it always wins), otherwise SEED it from the image's own subject — its
 *  direction, else the lyric line — so motion starts from what the frame depicts
 *  ("Victoria plays with Kitty in the park") instead of blank. The user can edit or
 *  clear it; an empty save means "default motion". */
export function motionSeed(seg: ReviewSegment | undefined): string {
  if (seg?.motionDirection) return seg.motionDirection;
  return seg?.direction?.trim() || seg?.text || "";
}

/** Seconds → "M:SS" for the per-scene timecode chips. */
export function fmtTime(s: number): string {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/** Motion-editor clip preview: plays the (silent) motion clip together with the
 *  song's audio seeked to this scene's window, so the user hears the lyric the
 *  shot belongs to. The fitted clip is exactly its scene length, so it ends on its
 *  own and we stop the audio with it — no separate timer needed. */
export function ClipPreview({
  clipUrl,
  audioUrl,
  clipStart,
  busy,
  emptyState,
}: {
  clipUrl: string | null;
  audioUrl: string | null;
  clipStart: number;
  busy: boolean;
  /** Replaces the default "No motion clip yet" placeholder content (the video
   *  editor uses it for step/locked teaching states). */
  emptyState?: React.ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  // Stop + reset whenever the clip changes (e.g. after a regenerate).
  useEffect(() => {
    setPlaying(false);
    videoRef.current?.pause();
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [clipUrl]);

  async function toggle() {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      a?.pause();
      setPlaying(false);
      return;
    }
    v.currentTime = 0;
    if (a) {
      try {
        a.currentTime = clipStart;
      } catch {
        /* not seekable yet — it will start from where it can */
      }
    }
    setPlaying(true);
    try {
      await Promise.all([v.play(), a?.play() ?? Promise.resolve()]);
    } catch {
      /* autoplay/seek race — ignore */
    }
  }

  function stop() {
    audioRef.current?.pause();
    if (videoRef.current) videoRef.current.currentTime = 0;
    setPlaying(false);
  }

  // Idle with no clip → placeholder. While generating (even the FIRST clip, when
  // there's nothing underneath yet) the cool animation below shows instead.
  if (!clipUrl && !busy) {
    return (
      <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[12px] border border-dashed border-white/15 bg-black/40 text-center">
        {emptyState ?? (
          <>
            <Film className="h-7 w-7 text-white/30" />
            <p className="text-[12.5px] text-white/55">No motion clip yet</p>
            <p className="max-w-[80%] text-[11px] text-white/35">
              Generate to create &amp; preview this shot.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-[12px] border bg-black",
        busy ? "border-pulse/40" : "border-white/10",
      )}
    >
      {clipUrl && (
        <video
          ref={videoRef}
          key={clipUrl}
          src={clipUrl}
          muted
          playsInline
          onEnded={stop}
          className={cn(
            "h-full w-full object-cover transition-opacity duration-300",
            busy && "opacity-20",
          )}
        />
      )}
      {clipUrl && audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}
      {busy ? (
        <ClipGenerating />
      ) : (
        <button
          type="button"
          onClick={() => void toggle()}
          className="group absolute inset-0 flex items-center justify-center transition-colors hover:bg-black/15"
          aria-label={playing ? "Pause" : "Play with music"}
        >
          <span className="flex items-center gap-2 rounded-full bg-pulse/90 px-4 py-2 text-[12px] font-medium text-white shadow-lg backdrop-blur transition-transform group-hover:scale-105">
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-[1px]" />
            )}
            {playing ? "Pause" : "Play with music"}
          </span>
        </button>
      )}
    </div>
  );
}

/** The "a scene is being painted" animation — the image-generation counterpart
 *  of ClipGenerating: warm glow, staggered brush strokes sweeping across the
 *  canvas, and a brush that keeps working. Shown over the dimmed old image (a
 *  regenerate) or a dark canvas (first paint / the initial pre-render). */
export function ImagePainting({ label = "Painting this scene…" }: { label?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* dark scrim so the show pops no matter what's underneath */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px]" />
      {/* warm studio glow */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 30% 40%, rgba(255,45,45,0.45), transparent 65%)",
        }}
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
      />
      {/* brush strokes appearing across the canvas, one after another */}
      <div className="absolute inset-x-[10%] top-[16%] flex flex-col gap-[9%]">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            className="h-[7%] min-h-[8px] origin-left rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(255,45,45,1), rgba(255,140,120,0.95) 45%, rgba(255,255,255,0.85) 75%, transparent)",
              boxShadow: "0 0 18px rgba(255,45,45,0.45)",
              width: `${86 - i * 14}%`,
              marginLeft: `${i * 5}%`,
            }}
            animate={{ scaleX: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
            transition={{
              repeat: Infinity,
              duration: 2.8,
              times: [0, 0.35, 0.8, 1],
              delay: i * 0.35,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      {/* sweeping sheen, same family as the clip animation */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        animate={{ x: ["-120%", "520%"] }}
        transition={{ repeat: Infinity, duration: 2.1, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-end gap-1 pb-4">
        <motion.div
          className="flex items-center gap-2 text-[12.5px] font-medium text-white/85"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        >
          <motion.span
            animate={{ rotate: [-8, 10, -8], y: [0, -2, 0] }}
            transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
          >
            <Paintbrush className="h-4 w-4 text-pulse" />
          </motion.span>
          {label}
        </motion.div>
        <p className="text-[11px] text-white/45">usually ~15s · {secs}s</p>
      </div>
    </div>
  );
}

/** The "a motion clip is being synthesized" animation — a pulsing red glow, a
 *  sweeping render light, and a film strip whose frames light up in a wave. Shown
 *  while a clip regenerates (over the dimmed old clip, or a black box for the
 *  first one). */
export function ClipGenerating() {
  // Clips take ~30–75s (the video model submits → polls → downloads). A static
  // spinner that long reads as "stuck", so show elapsed time + set expectations.
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* breathing red glow */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,45,45,0.22), transparent 62%)",
        }}
        animate={{ opacity: [0.35, 0.9, 0.35] }}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
      />
      {/* sweeping render light */}
      <motion.div
        className="absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        animate={{ x: ["-120%", "520%"] }}
        transition={{ repeat: Infinity, duration: 1.7, ease: "easeInOut" }}
      />
      {/* film strip — frames light up in a wave (the clip being assembled) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="h-7 w-9 rounded-[3px] border bg-pulse/10"
              animate={{
                opacity: [0.25, 1, 0.25],
                scale: [0.9, 1.06, 0.9],
                borderColor: [
                  "rgba(255,45,45,0.25)",
                  "rgba(255,45,45,0.95)",
                  "rgba(255,45,45,0.25)",
                ],
                boxShadow: [
                  "0 0 0px rgba(255,45,45,0)",
                  "0 0 16px rgba(255,45,45,0.55)",
                  "0 0 0px rgba(255,45,45,0)",
                ],
              }}
              transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.13, ease: "easeInOut" }}
            />
          ))}
        </div>
        <motion.div
          className="flex items-center gap-2 text-[12.5px] font-medium text-white/85"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        >
          <Film className="h-4 w-4 text-pulse" />
          Animating this shot…
        </motion.div>
        <p className="text-[11px] text-white/45">
          This usually takes up to a minute · {secs}s
        </p>
      </div>
    </div>
  );
}
