import { lazy, Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Clapperboard, Loader2, Wand2 } from "lucide-react";
import { VIDEO_STYLE_PRESETS } from "@syllary/shared";
import { ApiError, generateDemoVideo } from "@/lib/api";
import { captureClient } from "@/lib/analytics";
import { ToolButton, ToolCard, ToolLabel } from "./tool-kit";

/** R3F is heavy — only ship the 3D loader once a render actually starts. */
const DemoVideoLoader = lazy(() => import("./demo-video-loader"));

const CUSTOM = "__custom__";
// The demo shows a compact subset so the styles fit in two tidy rows.
const DEMO_STYLES = VIDEO_STYLE_PRESETS.filter((p) => p.id !== "nyc-night");
const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-void px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/25 focus:border-white/20";
const cardCls = (sel: boolean) =>
  `relative overflow-hidden rounded-[10px] border transition-colors ${
    sel ? "border-pulse" : "border-white/10 hover:border-white/25"
  }`;
const cardLabel =
  "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-4 text-[11px] font-medium text-white";

/** One-shot demo lyric-video maker. A fixed ~10-second sample track the visitor
 *  can't change — they pick a visual style and (optionally) describe the scene,
 *  and get a single rendered lyric video, no upload and no sign-up. Two columns:
 *  controls on the left, a full-height preview on the right. Portable: mounted on
 *  the video-intent landing-page heroes via the registry. */
export function DemoLyricVideo() {
  const [styleId, setStyleId] = useState<string>(DEMO_STYLES[0]?.id ?? CUSTOM);
  const [customStyle, setCustomStyle] = useState("");
  const [description, setDescription] = useState("a song about small blue monster");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capped, setCapped] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const isCustom = styleId === CUSTOM;

  async function generate() {
    if (isCustom && !customStyle.trim()) {
      setError("Describe a visual style, or pick one.");
      return;
    }
    setBusy(true);
    setError(null);
    setVideoUrl(null);
    captureClient("demo_video_started", { style: isCustom ? "custom" : styleId });
    try {
      const res = await generateDemoVideo({
        styleId: isCustom ? undefined : styleId,
        customStyle: isCustom ? customStyle.trim() : undefined,
        description: description.trim(),
      });
      setVideoUrl(res.videoUrl);
      captureClient("demo_video_ready", { style: isCustom ? "custom" : styleId });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setCapped(true);
        setError("You've used your free demo render — make one from your own song above.");
      } else {
        setError(err instanceof Error ? err.message : "Couldn't generate the video. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolCard>
      <div className="grid items-stretch gap-5 md:grid-cols-2 md:gap-6">
        {/* Left: controls */}
        <div>
          <ToolLabel>Pick a style</ToolLabel>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_STYLES.map((p) => (
              <button key={p.id} type="button" onClick={() => setStyleId(p.id)} className={cardCls(styleId === p.id)}>
                <img
                  src={`/presets/${p.id}.jpg`}
                  alt={p.name}
                  loading="lazy"
                  className="aspect-video w-full object-cover"
                />
                <span className={cardLabel}>{p.name}</span>
                {styleId === p.id && (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-pulse text-white">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            ))}
            <button type="button" onClick={() => setStyleId(CUSTOM)} className={cardCls(isCustom)}>
              <div className="flex aspect-video w-full items-center justify-center bg-white/[0.04]">
                <Wand2 className="h-5 w-5 text-white/30" />
              </div>
              <span className={cardLabel}>Your own</span>
            </button>
          </div>

          {isCustom && (
            <input
              className={`${inputCls} mt-2.5`}
              value={customStyle}
              onChange={(e) => setCustomStyle(e.target.value)}
              placeholder="e.g. dreamy watercolor, pastel skies"
              maxLength={600}
            />
          )}

          <div className="mt-4">
            <ToolLabel>Scene description (optional)</ToolLabel>
            <input
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's the song about?"
              maxLength={600}
            />
          </div>

          {error && <p className="mt-3 text-[12px] text-pulse">{error}</p>}

          <div className="mt-4">
            <ToolButton onClick={generate} disabled={busy || capped}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {busy ? "Generating…" : "Generate lyric video"}
            </ToolButton>
          </div>
        </div>

        {/* Right: preview — fills the column height; 3D loader + a reveal. */}
        <div className="flex flex-col">
          <ToolLabel>Preview</ToolLabel>
          <div
            className={`relative min-h-[240px] flex-1 overflow-hidden rounded-xl border ${
              videoUrl
                ? "border-white/[0.08] bg-black"
                : busy
                  ? "border-pulse/30 bg-black"
                  : "border-dashed border-white/[0.14] bg-void"
            }`}
            style={{ perspective: "1200px" }}
          >
            {/* No mode="wait" — the loading state lazy-loads R3F (Suspense), and
                "wait" would stall on the suspended child and freeze the swap. */}
            <AnimatePresence initial={false}>
              {videoUrl ? (
                <motion.div
                  key="video"
                  className="absolute inset-0"
                  initial={{ opacity: 0, scale: 0.85, rotateY: -22, filter: "blur(10px)" }}
                  animate={{ opacity: 1, scale: 1, rotateY: 0, filter: "blur(0px)" }}
                  transition={{ type: "spring", stiffness: 110, damping: 15 }}
                >
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-full w-full bg-black object-contain"
                  />
                </motion.div>
              ) : busy ? (
                <motion.div
                  key="loading"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 1.15 }}
                  transition={{ duration: 0.4 }}
                >
                  <Suspense
                    fallback={
                      <div className="flex h-full items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-pulse" />
                      </div>
                    }
                  >
                    <DemoVideoLoader />
                  </Suspense>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 pb-4">
                    <p className="text-[12px] font-medium text-white/85">Painting each scene…</p>
                    <p className="text-[11px] text-white/40">syncing the lyrics · about a minute</p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <Clapperboard className="h-6 w-6 text-white/20" />
                  <p className="mt-2 text-[12px] text-white/40">Preview will be here soon</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </ToolCard>
  );
}
