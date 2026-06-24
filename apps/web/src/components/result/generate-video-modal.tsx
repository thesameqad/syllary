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
  Plus,
  Shapes,
  Sparkles,
  User,
  Users,
  Wand2,
} from "lucide-react";
import {
  type BandMember,
  findMentionedNames,
  IMAGE_QUALITIES,
  IMAGE_QUALITY_INFO,
  estimateVideoCost,
  IMAGE_SIZES,
  IMAGE_SIZE_INFO,
  type ImageQuality,
  type ImageSize,
  MAX_VIDEO_CHARACTERS,
  referenceCountFor,
  type Song,
  type SongElement,
  type VideoJob,
  VIDEO_MODELS,
  VIDEO_MODEL_INFO,
  type VideoModel,
  type VideoPipelineMode,
  VIDEO_STYLE_PRESETS,
} from "@syllary/shared";
import { ApiError, createLyricsVideo, getVideoBrief, listElements, listMembers } from "@/lib/api";
import { ElementEditModal } from "@/components/dashboard/element-edit-modal";
import { useAccount } from "@/lib/account-context";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { Button3D } from "@/components/ui/button-3d";
import { VideoFormatPreview } from "@/components/result/video-format-preview";
import { MentionTextarea } from "@/components/ui/mention-textarea";
import { cn } from "@/lib/utils";
import { captureClient } from "@/lib/analytics";

const STYLE_ICON: Record<VideoModel, typeof Images> = {
  fast: Images,
  normal: Wand2,
  pro: Film,
};

// Visual-look → video-format → quality/generation → (optional) cast → brief.
type Step = "style" | "format" | "settings" | "cast" | "direction";

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
  // Manual mode: pre-render every image up front, or generate each scene on demand.
  const [prerender, setPrerender] = useState(true);
  const [model, setModel] = useState<VideoModel>("fast");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("fast");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Manual mode + preview conflict: previews always run on autopilot, so confirm.
  const [confirmPreview, setConfirmPreview] = useState(false);
  // The song description: write your own, generate with AI, or none.
  const [briefMode, setBriefMode] = useState<"write" | "ai" | "none">("write");
  const [sceneBrief, setSceneBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefLoaded, setBriefLoaded] = useState(false);
  // Cast members the user can optionally depict as characters in scenes.
  const [members, setMembers] = useState<BandMember[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  // Per-song persisted elements — a catalog you create + @mention (mention-driven,
  // not selected per-video).
  const [elements, setElements] = useState<SongElement[]>([]);
  const [elementModal, setElementModal] = useState<{ element: SongElement | null } | null>(null);

  // Reference images sent per frame for the selected band members — matches the
  // server's resolution so the quoted price equals the charged price. (Elements are
  // mention-driven, resolved per scene, so they're not priced up front here.)
  const referenceImages = useMemo(
    () =>
      referenceCountFor(
        members.filter((m) => selectedCharacterIds.includes(m.id)).map((m) => m.images.length),
      ),
    [members, selectedCharacterIds],
  );

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
        referenceImages,
      }),
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds, referenceImages],
  );
  const cost = estimate.tokens;
  // Manual + "I'll generate each scene" charges nothing up front (pay per scene),
  // so the quoted/charged up-front price is 0.
  const noPrerender = mode === "manual" && !prerender;
  const upfrontCost = noPrerender ? 0 : cost;
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
        referenceImages,
      }).tokens,
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds, referenceImages],
  );
  const credits = account?.credits ?? null;
  const broke = credits !== null && credits < upfrontCost;
  const brokePreview = credits !== null && credits < previewCost;
  // A preview only makes sense when it's actually cheaper than the full render.
  // For short songs the ~10s window already covers everything, so preview cost ==
  // full cost — in that case the preview is pointless and we hide it.
  const canPreview = previewCost < cost;
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
      setSceneBrief("");
      setBriefLoaded(false);
      setBriefLoading(false);
      setSelectedCharacterIds([]);
      setElementModal(null);
      setPrerender(true);
      setBriefMode("write");
      // Load the user's band members + this song's elements for the cast step.
      listMembers()
        .then(setMembers)
        .catch(() => setMembers([]));
      listElements(song.id)
        .then(setElements)
        .catch(() => setElements([]));
    }
  }, [open, song.id]);

  // --- Funnel instrumentation: client view/intent events for the video flow, so
  //     the "Video flow" funnels show exactly where users drop off in the modal.
  useEffect(() => {
    if (open) captureClient("video_modal_opened", { song_id: song.id });
  }, [open, song.id]);
  useEffect(() => {
    if (open) captureClient("video_step_advanced", { step, model, song_id: song.id });
  }, [open, step, model, song.id]);
  useEffect(() => {
    if (open && step === "direction" && canPreview && brokePreview) {
      captureClient("video_preview_blocked_insufficient", {
        song_id: song.id,
        model,
        preview_cost: previewCost,
        credits,
      });
    }
  }, [open, step, canPreview, brokePreview, model, previewCost, credits, song.id]);

  // Only members with at least one photo / elements with an image are usable refs.
  const usableMembers = members.filter((m) => m.images.length > 0);
  const usableElements = elements.filter((e) => e.imageUrl);
  // @mention list for the brief = selected band members + ALL the song's elements
  // (elements are mention-driven, so any of them can be referenced by name).
  const castNames = [
    ...usableMembers.filter((m) => selectedCharacterIds.includes(m.id)).map((m) => m.name),
    ...usableElements.map((e) => e.name),
  ];

  // After settings: always stop at the optional cast step — members are picked there
  // and elements added (skippable with Next).
  function afterSettings() {
    setStep("cast");
  }

  function toggleCharacter(id: string) {
    setSelectedCharacterIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_VIDEO_CHARACTERS
          ? prev
          : [...prev, id],
    );
  }

  // Merge a created/edited element into the catalog list.
  function onElementSaved(el: SongElement) {
    setElements((prev) =>
      prev.some((e) => e.id === el.id) ? prev.map((e) => (e.id === el.id ? el : e)) : [...prev, el],
    );
  }

  // Append "@Name " to the brief (no-op if already mentioned) — same as the manual
  // editor's tappable chips.
  function insertMention(name: string) {
    setSceneBrief((d) => {
      if (findMentionedNames(d, [name]).length > 0) return d;
      const base = d.trimEnd();
      return `${base ? base + " " : ""}@${name} `;
    });
  }

  // Switch the song-description mode. "ai" fetches the AI brief once.
  function chooseBriefMode(next: "write" | "ai" | "none") {
    setBriefMode(next);
    if (next === "ai" && !briefLoaded) {
      setBriefLoading(true);
      getVideoBrief(song.id, effectiveStyle)
        .then((b) => setSceneBrief(b))
        .catch(() => undefined)
        .finally(() => {
          setBriefLoaded(true);
          setBriefLoading(false);
        });
    }
  }

  function goToDirection() {
    setStep("direction");
  }

  // Preview always runs on autopilot — if Manual is selected, confirm first.
  function onPreviewClick() {
    captureClient("video_preview_clicked", { song_id: song.id, model, preview_cost: previewCost });
    if (mode === "manual") setConfirmPreview(true);
    else void generate(true);
  }

  async function generate(preview: boolean) {
    if (!preview) {
      captureClient("video_generate_clicked", { song_id: song.id, model, mode, cost: upfrontCost });
    }
    const setBusy = preview ? setPreviewing : setSubmitting;
    setBusy(true);
    try {
      const created = await createLyricsVideo(song.id, {
        styleDescription: effectiveStyle,
        // "" (None, or a blank "write my own") = explicit no-context; the server
        // won't auto-derive a brief over it. An absent field is what auto-derives.
        sceneBrief: briefMode === "none" ? "" : sceneBrief.trim(),
        mode,
        model,
        aspectRatio: "16:9",
        imageSize,
        imageQuality,
        preview,
        // Manual + "I'll generate each scene" = skip pre-rendering all images.
        prerenderImages: mode === "manual" ? prerender : true,
        characterIds: selectedCharacterIds.length > 0 ? selectedCharacterIds : undefined,
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
    <>
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

            <div className="space-y-4">
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
              <Button3D disabled={effectiveStyle.length === 0} onClick={() => setStep("format")}>
                Next
              </Button3D>
            </div>
          </motion.div>
        )}

        {step === "format" && (
          <motion.div
            key="format"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pulse/25 to-pulse/5 text-pulse shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <Film className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[14px] font-medium text-white">Pick your video style</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-white/50">
                  How much should it move? From a clean slideshow to a fully AI-directed music
                  video. The little previews show the kind of motion — not your chosen look.
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              {VIDEO_MODELS.map((m) => (
                <StyleCard key={m} model={m} selected={model === m} onSelect={() => setModel(m)} />
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
              <Button3D variant="secondary" onClick={() => setStep("style")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button3D>
              <Button3D onClick={() => setStep("settings")}>Next</Button3D>
            </div>
          </motion.div>
        )}

        {step === "settings" && (
          <motion.div
            key="settings"
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
                <h3 className="text-[14px] font-medium text-white">Quality &amp; generation</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-white/50">
                  Fine-tune resolution, image quality, and whether we build it for you or you review
                  each scene. The defaults are great if you're not sure.
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-x-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="min-w-0 text-[12px] text-white/55">
                {noPrerender ? (
                  <>
                    <span className="font-medium text-white">Nothing now</span> — pay per scene as you
                    generate
                    {estimate.segments > 0 && (
                      <span className="text-white/40"> (~{cost} for {estimate.segments})</span>
                    )}
                  </>
                ) : (
                  <>
                    This will use <span className="font-medium text-white">{cost} tokens</span>
                    {estimate.segments > 0 && (
                      <span className="text-white/40"> · {estimate.segments} scenes</span>
                    )}
                  </>
                )}
              </div>
              <div className={cn("text-[12px] shrink-0", broke ? "text-pulse" : "text-white/45")}>
                {credits === null ? "—" : `You have ${credits} tokens`}
              </div>
            </div>

            <div className="space-y-5">
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
                        <div className="flex flex-wrap items-center gap-2">
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
                {mode === "manual" && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPrerender(true)}
                      className={cn(
                        "rounded-[10px] border px-3 py-2 text-left transition-colors",
                        prerender
                          ? "border-pulse/60 bg-pulse/[0.08]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25",
                      )}
                    >
                      <div className="text-[12.5px] font-medium text-white">Pre-generate all images</div>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/45">
                        Every scene is drawn up front, ready to review. Charged now.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrerender(false)}
                      className={cn(
                        "rounded-[10px] border px-3 py-2 text-left transition-colors",
                        !prerender
                          ? "border-pulse/60 bg-pulse/[0.08]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25",
                      )}
                    >
                      <div className="text-[12.5px] font-medium text-white">I'll generate each scene</div>
                      <p className="mt-0.5 text-[11px] leading-snug text-white/45">
                        Start blank — script + generate each scene on demand. Pay per scene.
                      </p>
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
              <Button3D variant="secondary" onClick={() => setStep("format")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button3D>
              <Button3D onClick={afterSettings}>Next</Button3D>
            </div>
          </motion.div>
        )}

        {step === "cast" && (
          <motion.div
            key="cast"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pulse/25 to-pulse/5 text-pulse shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[14px] font-medium text-white">Cast &amp; elements (optional)</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-white/50">
                  Cast members are people (real or AI-generated) the AI paints into scenes from your
                  photos; elements are recurring objects (a dog, headphones, props). Add anyone or
                  anything the video should feature, then reference them by name in the brief or a scene.
                </p>
              </div>
            </div>

            <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
              {/* Cast members */}
              {usableMembers.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white/45">
                    <Users className="h-3.5 w-3.5" /> Cast members
                    <span className="font-normal normal-case tracking-normal text-white/30">
                      · up to {MAX_VIDEO_CHARACTERS}
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {usableMembers.map((m) => {
                      const sel = selectedCharacterIds.includes(m.id);
                      const atMax = !sel && selectedCharacterIds.length >= MAX_VIDEO_CHARACTERS;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          disabled={atMax}
                          onClick={() => toggleCharacter(m.id)}
                          className={cn(
                            "overflow-hidden rounded-[12px] border text-left transition-colors disabled:opacity-40",
                            sel
                              ? "border-pulse bg-pulse/[0.08]"
                              : "border-white/10 bg-white/[0.02] hover:border-white/25",
                          )}
                        >
                          <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                            {m.images[0] ? (
                              <img src={m.images[0].url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <User className="h-7 w-7 text-white/25" />
                              </div>
                            )}
                            {sel && (
                              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white shadow">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          <div className="px-2.5 py-1.5 text-[12px] font-medium text-white">
                            <span className="block truncate">{m.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Persisted elements (per-song catalog) — @mention them, no selection */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white/45">
                  <Shapes className="h-3.5 w-3.5" /> Elements
                  <span className="font-normal normal-case tracking-normal text-white/30">
                    · a dog, headphones — @mention them in the next step
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {usableElements.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setElementModal({ element: e })}
                      className="overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.02] text-left transition-colors hover:border-white/25"
                    >
                      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                        {e.imageUrl ? (
                          <img src={e.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Shapes className="h-7 w-7 text-white/25" />
                          </div>
                        )}
                      </div>
                      <div className="px-2.5 py-1.5 text-[12px] font-medium text-white">
                        <span className="block truncate">{e.name}</span>
                      </div>
                    </button>
                  ))}
                  {/* Add element */}
                  <button
                    type="button"
                    onClick={() => setElementModal({ element: null })}
                    className="flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-[12px] border border-dashed border-white/15 text-white/50 transition-colors hover:border-pulse/50 hover:text-white"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-[11px] font-medium">Add element</span>
                  </button>
                </div>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-white/40">
              {selectedCharacterIds.length === 0
                ? "No cast members selected. You can still @mention any element by name next."
                : `${selectedCharacterIds.length} cast member${selectedCharacterIds.length > 1 ? "s" : ""} selected · @mention elements by name in the next step.`}
            </p>

            <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
              <Button3D variant="secondary" onClick={() => setStep("settings")}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button3D>
              <Button3D onClick={goToDirection}>Next</Button3D>
            </div>
          </motion.div>
        )}

        {step === "direction" && (
          <motion.div
            key="direction"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pulse/25 to-pulse/5 text-pulse shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
                <Wand2 className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-[14px] font-medium text-white">What's the video about?</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-white/50">
                  Set the visual direction for every scene — write your own, let AI suggest one, or
                  skip it and steer each scene yourself.
                </p>
              </div>
            </div>

            {/* Song description: write your own / generate with AI / none */}
            <div className="mb-3 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 max-sm:w-full max-sm:flex-wrap sm:inline-flex">
              {(
                [
                  { key: "write", label: "Write my own" },
                  { key: "ai", label: "Generate with AI" },
                  { key: "none", label: "None" },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => chooseBriefMode(key)}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                    briefMode === key
                      ? "bg-pulse text-white shadow-[0_2px_10px_rgba(255,45,45,0.4)]"
                      : "text-white/55 hover:text-white",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {briefMode === "none" ? (
              <div className="rounded-[12px] border border-white/10 bg-black/30 px-3.5 py-4 text-[12.5px] leading-relaxed text-white/50">
                No song description — scenes follow each lyric line and any per-scene direction or
                @mention you add later.
              </div>
            ) : briefLoading ? (
              <div className="flex items-center gap-2 rounded-[12px] border border-white/10 bg-black/30 px-3.5 py-6 text-[13px] text-white/55">
                <Loader2 className="h-4 w-4 animate-spin text-pulse" />
                Analyzing the song…
              </div>
            ) : (
              <MentionTextarea
                value={sceneBrief}
                onChange={setSceneBrief}
                names={castNames}
                rows={5}
                placeholder={
                  briefMode === "ai"
                    ? "AI suggestion — edit it freely."
                    : "Describe what the lyric video should be about — the subject, story, and point of view."
                }
                className="w-full resize-none rounded-[12px] border border-white/10 bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/60 focus:bg-pulse/[0.04]"
              />
            )}

            {/* Tap to @mention a cast member or element in the description. */}
            {briefMode !== "none" && !briefLoading && castNames.length > 0 && (
              <div className="mt-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {castNames.map((name) => {
                    const active = findMentionedNames(sceneBrief, [name]).length > 0;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => insertMention(name)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                          active
                            ? "border-pulse/60 bg-pulse/[0.12] text-white"
                            : "border-white/10 bg-white/[0.03] text-white/65 hover:border-pulse/50 hover:text-white",
                        )}
                      >
                        @{name}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-white/40">
                  Tap to mention a cast member or element by name.
                </p>
              </div>
            )}

            {canPreview && (
              <div className="mt-4 rounded-[12px] border border-pulse/20 bg-pulse/[0.06] px-4 py-2.5 text-[12px] text-white/70">
                ✨ Not sure how it'll look? <span className="font-medium text-white">Preview</span>{" "}
                renders a ~10s sample for just{" "}
                <span className="font-medium text-white">{previewCost} tokens</span> first.
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-x-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="min-w-0 text-[12px] text-white/55">
                {noPrerender ? (
                  <>
                    <span className="font-medium text-white">Nothing now</span> — pay per scene as you
                    generate
                    {estimate.segments > 0 && (
                      <span className="text-white/40"> (~{cost} for {estimate.segments})</span>
                    )}
                  </>
                ) : (
                  <>
                    This will use <span className="font-medium text-white">{cost} tokens</span>
                    {estimate.segments > 0 && (
                      <span className="text-white/40"> · {estimate.segments} scenes</span>
                    )}
                  </>
                )}
              </div>
              <div className={cn("text-[12px] shrink-0", broke ? "text-pulse" : "text-white/45")}>
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
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-4">
                <Button3D
                  variant="secondary"
                  className="whitespace-nowrap"
                  onClick={() => setStep(usableMembers.length > 0 ? "cast" : "settings")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button3D>
                <div className="flex flex-wrap items-center gap-2">
                  {canPreview && (
                    <Button3D
                      variant="secondary"
                      className="whitespace-nowrap"
                      disabled={previewing || submitting || brokePreview || briefLoading}
                      onClick={onPreviewClick}
                    >
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {brokePreview ? "Not enough" : `Preview · ${previewCost}`}
                    </Button3D>
                  )}
                  <Button3D
                    className="whitespace-nowrap"
                    disabled={submitting || previewing || broke || briefLoading}
                    onClick={() => void generate(false)}
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Clapperboard className="h-4 w-4" />
                    )}
                    {broke
                      ? "Not enough tokens"
                      : noPrerender
                        ? "Start — generate scenes"
                        : `Generate · ${cost}`}
                  </Button3D>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
    {elementModal && (
      <ElementEditModal
        songId={song.id}
        element={elementModal.element}
        onClose={() => setElementModal(null)}
        onSaved={onElementSaved}
      />
    )}
    </>
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
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
      className={cn(
        "relative w-full overflow-hidden rounded-[16px] border p-4 text-left transition-colors",
        selected
          ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.13] to-transparent shadow-[0_14px_36px_-14px_rgba(255,45,45,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]"
          : "border-white/[0.08] bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]",
      )}
    >
      {/* Mobile: preview stacks full-width on top (big enough to read the motion);
          desktop: preview sits to the left of the text, as before. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3.5">
        <div className="w-full shrink-0 sm:w-[140px]">
          <VideoFormatPreview model={model} />
        </div>
        <div className="min-w-0 sm:flex-1">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4 shrink-0", selected ? "text-pulse" : "text-white/55")} />
            {/* Label + tagline: inline on desktop, tagline drops to its own line on
                mobile so neither the label nor the tagline wraps mid-word. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
              <span className="whitespace-nowrap text-[15px] font-medium text-white">{info.label}</span>
              <span className="text-[12px] text-white/45">{info.tagline}</span>
            </div>
            {selected && (
              <span className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pulse text-white">
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
