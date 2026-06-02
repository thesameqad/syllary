import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Check,
  Clapperboard,
  Eye,
  Film,
  Hand,
  Images,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import {
  IMAGE_QUALITIES,
  IMAGE_QUALITY_INFO,
  estimateVideoCost,
  IMAGE_SIZES,
  IMAGE_SIZE_INFO,
  type ImageQuality,
  type ImageSize,
  type Song,
  type VideoJob,
  VIDEO_MODELS,
  VIDEO_MODEL_INFO,
  type VideoModel,
  type VideoPipelineMode,
  VIDEO_STYLE_PRESETS,
} from "@syllary/shared";
import { ApiError, createLyricsVideo } from "@/lib/api";
import { useAccount } from "@/lib/account-context";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button3D } from "@/components/ui/button-3d";
import { cn } from "@/lib/utils";

const STYLE_ICON: Record<VideoModel, typeof Images> = {
  fast: Images,
  normal: Wand2,
  pro: Film,
};

type Step = "style" | "mode";

const PLACEHOLDER =
  "e.g. dreamy neon synthwave city at night, cinematic, volumetric haze, deep blues and magenta";

export function GenerateVideoModal({
  open,
  song,
  onClose,
  onStarted,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  /** Fired once the job is created. The parent closes the modal and shows the
   *  in-player progress; the modal itself does not track progress. */
  onStarted: (job: VideoJob) => void;
}) {
  const toast = useToast();
  const { account, refresh } = useAccount();
  const [step, setStep] = useState<Step>("style");
  const [style, setStyle] = useState("");
  const [presetId, setPresetId] = useState<string | null>(null);
  const [mode, setMode] = useState<VideoPipelineMode>("autopilot");
  const [model, setModel] = useState<VideoModel>("fast");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("fast");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Manual mode + preview conflict: previews always run on autopilot, so confirm.
  const [confirmPreview, setConfirmPreview] = useState(false);

  // Live price for the chosen settings, computed from the same timeline the
  // renderer will produce — recomputes on every mode/quality/resolution change.
  const estimate = useMemo(
    () =>
      estimateVideoCost({
        model,
        quality: imageQuality,
        imageSize,
        lyrics: song.lyrics,
        durationSeconds: song.durationSeconds,
      }),
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds],
  );
  const cost = estimate.tokens;
  // Cost of a cheap ~10s preview (same formula, preview window).
  const previewCost = useMemo(
    () =>
      estimateVideoCost({
        model,
        quality: imageQuality,
        imageSize,
        lyrics: song.lyrics,
        durationSeconds: song.durationSeconds,
        preview: true,
      }).tokens,
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds],
  );
  const credits = account?.credits ?? null;
  const broke = credits !== null && credits < cost;
  const brokePreview = credits !== null && credits < previewCost;
  // A preset's hidden prompt, or the user's custom description.
  const effectiveStyle = presetId
    ? (VIDEO_STYLE_PRESETS.find((p) => p.id === presetId)?.prompt ?? "")
    : style.trim();

  // Reset to a clean slate whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setStep("style");
      setStyle("");
      setPresetId(null);
      setModel("fast");
      setImageSize("1K");
      setImageQuality("fast");
      setMode("autopilot");
      setSubmitting(false);
      setPreviewing(false);
      setConfirmPreview(false);
    }
  }, [open]);

  // Preview always runs on autopilot — if Manual is selected, confirm first.
  function onPreviewClick() {
    if (mode === "manual") setConfirmPreview(true);
    else void generate(true);
  }

  async function generate(preview: boolean) {
    const setBusy = preview ? setPreviewing : setSubmitting;
    setBusy(true);
    try {
      const created = await createLyricsVideo(song.id, {
        styleDescription: effectiveStyle,
        mode,
        model,
        aspectRatio: "16:9",
        imageSize,
        imageQuality,
        preview,
      });
      refresh(); // tokens were just charged
      onStarted(created);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not start the video.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate lyrics video" widthClass="max-w-[620px]">
      <AnimatePresence mode="wait">
        {step === "style" && (
          <motion.div
            key="style"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pulse/25 to-pulse/5 text-pulse shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[14px] font-medium text-white">Pick a style</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-white/50">
                  Tap a look below, or describe your own. Every line becomes an AI scene in this
                  style.
                </p>
              </div>
            </div>

            <div className="max-h-[56vh] space-y-4 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {VIDEO_STYLE_PRESETS.map((p) => {
                  const sel = presetId === p.id;
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPresetId(p.id);
                        setStyle("");
                      }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 24 }}
                      className={cn(
                        "overflow-hidden rounded-[12px] border text-left transition-colors",
                        sel
                          ? "border-pulse bg-pulse/[0.08] shadow-[0_10px_26px_-12px_rgba(255,45,45,0.6)]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25",
                      )}
                    >
                      <div className="relative">
                        <img
                          src={`/presets/${p.id}.jpg`}
                          alt={p.name}
                          loading="lazy"
                          className="aspect-video w-full object-cover"
                        />
                        {sel && (
                          <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white shadow">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                      <div className="px-2.5 py-2">
                        <span className="block text-[12px] font-medium text-white">{p.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                          {p.description}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                  Or describe your own
                </span>
                <textarea
                  value={style}
                  onChange={(e) => {
                    setStyle(e.target.value);
                    setPresetId(null);
                  }}
                  rows={3}
                  placeholder={PLACEHOLDER}
                  className="mt-2 w-full resize-none rounded-[12px] border border-white/10 bg-black/30 px-3.5 py-3 text-[13px] text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/60 focus:bg-pulse/[0.04]"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
              <Button3D variant="secondary" onClick={onClose}>
                Cancel
              </Button3D>
              <Button3D disabled={effectiveStyle.length === 0} onClick={() => setStep("mode")}>
                Next
              </Button3D>
            </div>
          </motion.div>
        )}

        {step === "mode" && (
          <motion.div
            key="mode"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              <div>
                <h3 className="text-[14px] font-medium text-white">Pick your video style</h3>
                <p className="mt-0.5 text-[12px] text-white/45">
                  From a clean slideshow to a fully AI-directed music video.
                </p>
                <div className="mt-3 flex flex-col gap-2.5">
                  {VIDEO_MODELS.map((m) => (
                    <StyleCard
                      key={m}
                      model={m}
                      selected={model === m}
                      onSelect={() => setModel(m)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                  Resolution
                </span>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {IMAGE_SIZES.map((size) => {
                    const info = IMAGE_SIZE_INFO[size];
                    const selected = imageSize === size;
                    return (
                      <motion.button
                        key={size}
                        type="button"
                        title={info.description}
                        onClick={() => setImageSize(size)}
                        style={{ transformPerspective: 700 }}
                        whileHover={{ y: -2, rotateX: -6 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        className={cn(
                          "rounded-[12px] border px-3 py-2.5 text-center transition-colors",
                          selected
                            ? "border-pulse/50 bg-gradient-to-b from-pulse/[0.16] to-pulse/[0.04] text-white shadow-[0_8px_22px_-10px_rgba(255,45,45,0.6),inset_0_1px_0_rgba(255,255,255,0.15)]"
                            : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/20 hover:text-white",
                        )}
                      >
                        <span className="block text-[14px] font-medium">{info.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-tight text-white/45">
                          {size === "1K" ? "Recommended" : size === "2K" ? "Sharper" : "Sharpest"}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                  Image model
                </span>
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {IMAGE_QUALITIES.map((q) => {
                    const info = IMAGE_QUALITY_INFO[q];
                    const selected = imageQuality === q;
                    return (
                      <motion.button
                        key={q}
                        type="button"
                        onClick={() => setImageQuality(q)}
                        style={{ transformPerspective: 800 }}
                        whileHover={{ y: -3, rotateX: -5 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        className={cn(
                          "relative overflow-hidden rounded-[14px] border p-3.5 text-left transition-colors",
                          selected
                            ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.12] to-transparent text-white shadow-[0_10px_30px_-12px_rgba(255,45,45,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[14px] font-medium text-white">{info.label}</span>
                          {q === "fast" && (
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/55">
                              Default
                            </span>
                          )}
                          {q === "pro" && (
                            <span className="rounded-full bg-pulse/15 px-2 py-0.5 text-[10px] font-medium text-pulse">
                              3× tokens
                            </span>
                          )}
                          {selected && (
                            <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11.5px] leading-snug text-white/50">
                          {info.description}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                  Generation
                </span>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <ModeCard
                    icon={Bot}
                    label="Autopilot"
                    desc="We build the whole video for you — sit back and watch."
                    tokens={estimate.tokens}
                    selected={mode === "autopilot"}
                    onSelect={() => setMode("autopilot")}
                  />
                  <ModeCard
                    icon={Hand}
                    label="Manual"
                    desc="Review and regenerate each scene before you stitch the video."
                    tokens={estimate.tokens}
                    selected={mode === "manual"}
                    onSelect={() => setMode("manual")}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[12px] border border-pulse/20 bg-pulse/[0.06] px-4 py-2.5 text-[12px] text-white/70">
              ✨ Not sure how it'll look? <span className="font-medium text-white">Preview</span>{" "}
              renders a ~10s sample from the first line for just{" "}
              <span className="font-medium text-white">{previewCost} tokens</span> first.
            </div>

            <div className="mt-4 flex items-center justify-between rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="text-[12px] text-white/55">
                This will use <span className="font-medium text-white">{cost} tokens</span>
                {estimate.segments > 0 && (
                  <span className="text-white/40"> · {estimate.segments} scenes</span>
                )}
              </div>
              <div className={cn("text-[12px]", broke ? "text-pulse" : "text-white/45")}>
                {credits === null ? "—" : `You have ${credits} tokens`}
              </div>
            </div>

            {confirmPreview ? (
              <div className="mt-5 rounded-[12px] border border-pulse/30 bg-pulse/[0.06] p-4">
                <p className="text-[13px] leading-relaxed text-white/80">
                  Previews always run on <span className="font-medium text-white">Autopilot</span> —
                  scene-by-scene <span className="font-medium text-white">Manual</span> review isn't
                  available for a 10-second preview. Generate the preview anyway?
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button3D variant="secondary" onClick={() => setConfirmPreview(false)}>
                    Go back
                  </Button3D>
                  <Button3D
                    disabled={previewing || brokePreview}
                    onClick={() => {
                      setConfirmPreview(false);
                      void generate(true);
                    }}
                  >
                    {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    {brokePreview ? "Not enough" : "OK, preview"}
                  </Button3D>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
                <Button3D variant="secondary" onClick={() => setStep("style")}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button3D>
                <div className="flex items-center gap-2">
                  <Button3D
                    variant="secondary"
                    disabled={previewing || submitting || brokePreview}
                    onClick={onPreviewClick}
                  >
                    {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                    {brokePreview ? "Not enough" : `Preview · ${previewCost}`}
                  </Button3D>
                  <Button3D disabled={submitting || previewing || broke} onClick={() => void generate(false)}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clapperboard className="h-4 w-4" />
                    )}
                    {broke ? "Not enough tokens" : `Generate · ${cost}`}
                  </Button3D>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function ModeCard({
  icon: Icon,
  label,
  desc,
  tokens,
  selected = false,
  onSelect,
}: {
  icon: typeof Bot;
  label: string;
  desc: string;
  tokens: number;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      style={{ transformPerspective: 800 }}
      whileHover={{ y: -3, rotateX: -5 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className={cn(
        "relative overflow-hidden rounded-[14px] border p-3.5 text-left transition-colors",
        selected
          ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.12] to-transparent shadow-[0_10px_30px_-12px_rgba(255,45,45,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            selected
              ? "bg-gradient-to-br from-pulse to-[#8B0000] text-white shadow-[0_4px_14px_rgba(255,45,45,0.45)]"
              : "bg-white/[0.05] text-white/70",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {selected ? (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[13px] font-medium text-white">{label}</span>
        <span className="rounded-full bg-black/30 px-2 py-0.5 text-[10px] text-white/65">
          {tokens} tokens
        </span>
      </div>
      <p className="mt-1 text-[12px] leading-snug text-white/50">{desc}</p>
    </motion.button>
  );
}

function StyleCard({
  model,
  selected,
  onSelect,
}: {
  model: VideoModel;
  selected: boolean;
  onSelect: () => void;
}) {
  const info = VIDEO_MODEL_INFO[model];
  const Icon = STYLE_ICON[model];
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      style={{ transformPerspective: 900 }}
      whileHover={{ y: -3, rotateX: -3 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
      className={cn(
        "relative w-full overflow-hidden rounded-[16px] border p-4 text-left",
        selected
          ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.13] to-transparent shadow-[0_14px_36px_-14px_rgba(255,45,45,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/20",
      )}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
            selected
              ? "bg-gradient-to-br from-pulse to-[#8B0000] text-white shadow-[0_6px_18px_rgba(255,45,45,0.45)]"
              : "bg-white/[0.05] text-white/70",
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-medium text-white">{info.label}</span>
            <span className="text-[12px] text-white/45">{info.tagline}</span>
            {selected && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] leading-snug text-white/55">{info.description}</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/65">
              {info.costHint}
            </span>
            {info.experimental && (
              <span className="rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-medium text-[#fbbf24]">
                Experimental
              </span>
            )}
            <span className="text-[11px] text-white/35">{info.eta}</span>
            {info.previewSeconds != null && (
              <span className="rounded-full bg-pulse/15 px-2 py-0.5 text-[10px] font-medium text-pulse">
                {info.previewSeconds}s preview
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
