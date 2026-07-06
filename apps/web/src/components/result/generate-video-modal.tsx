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
  SCENE_GROUPINGS,
  type SceneGrouping,
  type Song,
  type SongElement,
  type VideoJob,
  VIDEO_MODELS,
  VIDEO_MODEL_INFO,
  type VideoModel,
  type VideoPipelineMode,
  VIDEO_STYLE_PRESETS,
} from "@syllary/shared";
import {
  ApiError,
  createLyricsVideo,
  deleteElement,
  getVideoBrief,
  listElements,
  listMembers,
} from "@/lib/api";
import { ElementEditModal } from "@/components/dashboard/element-edit-modal";
import { CustomizeCastMemberModal } from "@/components/result/customize-cast-member-modal";
import { EntityCardMenu } from "@/components/dashboard/entity-card-menu";
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
  // Manual is the default: the new full-page Video Editor makes reviewing scenes
  // the primary flow; autopilot stays one tap away.
  const [mode, setMode] = useState<VideoPipelineMode>("manual");
  // Manual mode: pre-render every image up front, or generate each scene on demand.
  const [prerender, setPrerender] = useState(true);
  const [model, setModel] = useState<VideoModel>("fast");
  const [imageSize, setImageSize] = useState<ImageSize>("1K");
  const [imageQuality, setImageQuality] = useState<ImageQuality>("fast");
  // How lyric lines are grouped into scenes (time = ~10s scenes, the default).
  const [sceneGrouping, setSceneGrouping] = useState<SceneGrouping>("time");
  const [submitting, setSubmitting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Manual mode + preview conflict: previews always run on autopilot, so confirm.
  const [confirmPreview, setConfirmPreview] = useState(false);
  // The song description: write your own, generate with AI, or none.
  const [briefMode, setBriefMode] = useState<"write" | "ai" | "none">("write");
  const [sceneBrief, setSceneBrief] = useState("");
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefLoaded, setBriefLoaded] = useState(false);
  // Cast members the user can customize into per-video characters (elements).
  const [members, setMembers] = useState<BandMember[]>([]);
  // Per-song elements — the unified pool of subjects for this video (customized cast
  // members + objects). Selected ones are included; @mention them in scenes.
  const [elements, setElements] = useState<SongElement[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  // New plain-object element (ElementEditModal).
  const [elementModal, setElementModal] = useState<{ element: SongElement | null } | null>(null);
  // Customize a cast member into an instance, or edit an existing customized one.
  const [customizeModal, setCustomizeModal] = useState<{
    member: BandMember | null;
    element: SongElement | null;
  } | null>(null);

  // Characters are now customized-member elements, which (like all elements) are
  // mention-driven and resolved per scene — the server doesn't price them up front,
  // so neither do we. Quoted price == charged price.
  const referenceImages = 0;

  // "One scene" only exists on Living Scenes — leaving the style resets it.
  useEffect(() => {
    if (model !== "normal" && sceneGrouping === "single") setSceneGrouping("time");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Scene-grouping option copy (labels shown on the tile grid).
  const SCENE_GROUPING_INFO: Record<SceneGrouping, { label: string; description: string }> = {
    time: {
      label: "Every ~10 seconds",
      description: "Nearby lines share one scene — calm pacing and ~3× fewer scenes to pay for.",
    },
    line: {
      label: "Every line",
      description: "A new scene for every lyric line — the classic, fast-cutting look.",
    },
    block: {
      label: "By song section",
      description: "Verse and chorus blocks share a scene, up to 4 lines each.",
    },
    single: {
      label: "One scene",
      description:
        "A single looping shot carries the whole song — each line glows in at its sung moment. The cheapest way to a full video.",
    },
  };
  // "One scene" runs on the plates machinery — Living Scenes only.
  const groupingDisabled = (g: SceneGrouping) => g === "single" && model !== "normal";

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
        sceneGrouping,
      }),
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds, referenceImages, sceneGrouping],
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
        sceneGrouping,
      }).tokens,
    [model, imageQuality, imageSize, song.lyrics, song.durationSeconds, referenceImages, sceneGrouping],
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
      setSceneGrouping("time");
      setMode("manual");
      setSubmitting(false);
      setPreviewing(false);
      setConfirmPreview(false);
      setSceneBrief("");
      setBriefLoaded(false);
      setBriefLoading(false);
      setSelectedElementIds([]);
      setElementModal(null);
      setCustomizeModal(null);
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

  // Resolutions actually offered (4K is gated off) — drives the grid column count.
  const enabledSizes = IMAGE_SIZES.filter((size) => IMAGE_SIZE_INFO[size].enabled);
  // Cast members with a photo can be customized; elements with an image are usable.
  const usableMembers = members.filter((m) => m.images.length > 0);
  const usableElements = elements.filter((e) => e.imageUrl);
  // @mention list for the brief = the SELECTED elements (customized members + objects).
  const castNames = usableElements
    .filter((e) => selectedElementIds.includes(e.id))
    .map((e) => e.name);

  // After settings: always stop at the optional cast step — members are customized
  // there and elements selected (skippable with Next). Lite has no cast support
  // (Qwen-Image takes no reference photos), so it skips straight to the brief.
  function afterSettings() {
    setStep(imageQuality === "lite" ? "direction" : "cast");
  }

  function toggleElement(id: string) {
    setSelectedElementIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  // Merge a created/edited element into the list and auto-select it (the user just
  // made/customized it for this video). Renames keep the existing selection.
  function onElementSaved(el: SongElement) {
    setElements((prev) =>
      prev.some((e) => e.id === el.id) ? prev.map((e) => (e.id === el.id ? el : e)) : [...prev, el],
    );
    setSelectedElementIds((prev) => (prev.includes(el.id) ? prev : [...prev, el.id]));
  }

  // Remove an element everywhere (list + selection) after a delete.
  async function removeElement(el: SongElement) {
    await deleteElement(song.id, el.id);
    setElements((prev) => prev.filter((e) => e.id !== el.id));
    setSelectedElementIds((prev) => prev.filter((id) => id !== el.id));
  }

  // Open the right editor for an element: customized members → Customize modal
  // (re-feeds the source member's photos), plain objects → ElementEditModal.
  function editElement(el: SongElement) {
    if (el.sourceMemberId) {
      setCustomizeModal({
        member: members.find((m) => m.id === el.sourceMemberId) ?? null,
        element: el,
      });
    } else {
      setElementModal({ element: el });
    }
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
        sceneGrouping,
        preview,
        // Manual + "I'll generate each scene" = skip pre-rendering all images.
        prerenderImages: mode === "manual" ? prerender : true,
        elementIds: selectedElementIds.length > 0 ? selectedElementIds : undefined,
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
                <StyleCard
                  key={m}
                  model={m}
                  selected={model === m}
                  onSelect={() => {
                    setModel(m);
                    // Cinematic has no Lite tier — fall back to the default model.
                    if (m === "pro" && imageQuality === "lite") setImageQuality("fast");
                  }}
                />
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
                  Fine-tune resolution, the model, and whether we build it for you or you review
                  each scene. The defaults are great if you're not sure.
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between gap-x-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div className="min-w-0 text-[12px] text-white/55">
                {account?.plan === "free" ? (
                  <>
                    Free preview · <span className="font-medium text-white">{previewCost} tokens</span>
                    <span className="text-white/40"> · upgrade for the full video</span>
                  </>
                ) : noPrerender ? (
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
              <div
                className={cn(
                  // Hidden on mobile so "This will use…" gets the full width.
                  "hidden shrink-0 text-[12px] sm:block",
                  (account?.plan === "free" ? brokePreview : broke) ? "text-pulse" : "text-white/45",
                )}
              >
                {credits === null ? "—" : `You have ${credits} tokens`}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <span className="text-[11px] uppercase tracking-[0.5px] text-white/35">
                  Resolution
                </span>
                <div
                  className={cn(
                    "mt-2 grid gap-2",
                    enabledSizes.length === 1
                      ? "grid-cols-1"
                      : enabledSizes.length === 2
                        ? "grid-cols-2"
                        : "grid-cols-3",
                  )}
                >
                  {enabledSizes.map((size) => {
                    const info = IMAGE_SIZE_INFO[size];
                    const selected = imageSize === size;
                    // Lite bills per rounded-up megapixel — 1K is the only size
                    // that hits its price, so the rest are locked.
                    const sizeLocked = imageQuality === "lite" && size !== "1K";
                    return (
                      <motion.button
                        key={size}
                        type="button"
                        disabled={sizeLocked}
                        title={sizeLocked ? "The Lite model renders at 1K." : info.description}
                        onClick={() => setImageSize(size)}
                        style={{ transformPerspective: 700 }}
                        whileHover={{ y: -2, rotateX: -6 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        className={cn(
                          "rounded-[12px] border px-3 py-2.5 text-center transition-colors",
                          sizeLocked && "cursor-not-allowed opacity-40",
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
                  Model
                </span>
                <div
                  className={cn(
                    "mt-2 grid gap-2.5",
                    // Paid plans see the Lite tier as a third card; free users see
                    // exactly the two cards they always have (funnel unchanged).
                    account && account.plan !== "free" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2",
                  )}
                >
                  {IMAGE_QUALITIES.filter(
                    (q) =>
                      IMAGE_QUALITY_INFO[q].enabled &&
                      !(IMAGE_QUALITY_INFO[q].paidOnly && (!account || account.plan === "free")),
                  ).map((q) => {
                    const info = IMAGE_QUALITY_INFO[q];
                    const selected = imageQuality === q;
                    // Cinematic's morphing needs Grok/Seedance-2.0 — no Lite there.
                    const liteBlocked = q === "lite" && model === "pro";
                    return (
                      <motion.button
                        key={q}
                        type="button"
                        disabled={liteBlocked}
                        title={liteBlocked ? "Cinematic isn't available on Lite — pick Medium or Pro." : info.description}
                        onClick={() => {
                          setImageQuality(q);
                          if (q === "lite") {
                            setImageSize("1K"); // Lite renders 1K only
                            setSelectedElementIds([]); // no cast members on Lite
                          }
                        }}
                        style={{ transformPerspective: 800 }}
                        whileHover={{ y: -3, rotateX: -5 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        className={cn(
                          "relative overflow-hidden rounded-[14px] border p-3.5 text-left transition-colors",
                          liteBlocked && "cursor-not-allowed opacity-40",
                          selected
                            ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.12] to-transparent text-white shadow-[0_10px_30px_-12px_rgba(255,45,45,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-white">{info.label}</span>
                          {q === "lite" && (
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/55">
                              Cheapest
                            </span>
                          )}
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
                  Scene grouping
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {SCENE_GROUPINGS.map((g) => {
                    const info = SCENE_GROUPING_INFO[g];
                    const selected = sceneGrouping === g;
                    const disabled = groupingDisabled(g);
                    return (
                      <motion.button
                        key={g}
                        type="button"
                        disabled={disabled}
                        title={disabled ? "One scene needs the Living Scenes video style." : undefined}
                        onClick={() => setSceneGrouping(g)}
                        style={{ transformPerspective: 800 }}
                        whileHover={disabled ? undefined : { y: -3, rotateX: -5 }}
                        whileTap={disabled ? undefined : { scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22 }}
                        className={cn(
                          "relative overflow-hidden rounded-[14px] border p-3.5 text-left transition-colors",
                          selected
                            ? "border-pulse/50 bg-gradient-to-br from-pulse/[0.12] to-transparent text-white shadow-[0_10px_30px_-12px_rgba(255,45,45,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
                            : "border-white/[0.08] bg-white/[0.02] text-white/70 hover:border-white/20 hover:text-white",
                          disabled && "cursor-not-allowed opacity-45 hover:border-white/[0.08] hover:text-white/70",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] font-medium text-white">{info.label}</span>
                          {g === "time" && (
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/55">
                              Recommended
                            </span>
                          )}
                          {g === "single" && (
                            <span className="rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] font-medium text-white/55">
                              Living Scenes
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
                    icon={Hand}
                    label="Manual"
                    desc="Review and regenerate each scene in the editor before you stitch the video."
                    tokens={estimate.tokens}
                    selected={mode === "manual"}
                    onSelect={() => setMode("manual")}
                  />
                  <ModeCard
                    icon={Bot}
                    label="Autopilot"
                    desc="We build the whole video for you — sit back and watch."
                    tokens={estimate.tokens}
                    selected={mode === "autopilot"}
                    onSelect={() => setMode("autopilot")}
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
                        All {estimate.segments} scenes drawn up front, ready to review. Charges the
                        full <span className="text-white/70">{cost} tokens</span> (the total above)
                        when you start — nothing extra later.
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
                        Start blank — <span className="text-white/70">nothing charged now</span>; pay
                        per scene only as you generate each one.
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
                <p className="mt-0.5 hidden text-[12px] leading-snug text-white/50 sm:block">
                  Customize a cast member to lock their face, outfit &amp; hair for this video — it
                  becomes an element. Elements are the subjects (people + objects) the AI paints in;
                  select the ones to include, then @mention them by name in the brief or a scene.
                </p>
              </div>
            </div>

            <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
              {/* Cast members — templates: click to customize into a per-video instance */}
              {usableMembers.length > 0 && (
                <div>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white/45">
                    <Users className="h-3.5 w-3.5" /> Cast members
                    <span className="font-normal normal-case tracking-normal text-white/30">
                      · click to customize for this video
                    </span>
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {usableMembers.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCustomizeModal({ member: m, element: null })}
                        className="group overflow-hidden rounded-[12px] border border-white/10 bg-white/[0.02] text-left transition-colors hover:border-pulse/50"
                      >
                        <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                          {m.images[0] ? (
                            <img src={m.images[0].url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <User className="h-7 w-7 text-white/25" />
                            </div>
                          )}
                          <div className="absolute inset-0 flex items-end justify-start bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="m-1.5 inline-flex items-center gap-1 rounded-full bg-pulse px-2 py-0.5 text-[10px] font-medium text-white shadow">
                              <Wand2 className="h-3 w-3" /> Customize
                            </span>
                          </div>
                        </div>
                        <div className="px-2.5 py-1.5 text-[12px] font-medium text-white">
                          <span className="block truncate">{m.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Elements — the selectable pool (customized members + objects) */}
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.5px] text-white/45">
                  <Shapes className="h-3.5 w-3.5" /> Elements
                  <span className="font-normal normal-case tracking-normal text-white/30">
                    · click to include · ⋮ to edit or delete
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {usableElements.map((e) => {
                    const sel = selectedElementIds.includes(e.id);
                    return (
                      <div
                        key={e.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleElement(e.id)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            toggleElement(e.id);
                          }
                        }}
                        className={cn(
                          "group relative cursor-pointer overflow-hidden rounded-[12px] border text-left transition-colors",
                          sel
                            ? "border-pulse bg-pulse/[0.08]"
                            : "border-white/10 bg-white/[0.02] hover:border-white/25",
                        )}
                      >
                        <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
                          {e.imageUrl ? (
                            <img src={e.imageUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Shapes className="h-7 w-7 text-white/25" />
                            </div>
                          )}
                          {sel && (
                            <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-white shadow">
                              <Check className="h-3 w-3" />
                            </span>
                          )}
                          {/* 3-dot menu — stop propagation so it doesn't toggle selection */}
                          <div onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                            <EntityCardMenu
                              label={`Manage ${e.name}`}
                              onEdit={() => editElement(e)}
                              onDelete={() => removeElement(e)}
                              deleteTitle="Delete element?"
                              deleteWarning={
                                <>
                                  This removes <span className="text-white/80">{e.name}</span> and its
                                  reference image from this song. This can’t be undone.
                                </>
                              }
                            />
                          </div>
                        </div>
                        <div className="px-2.5 py-1.5 text-[12px] font-medium text-white">
                          <span className="block truncate">{e.name}</span>
                        </div>
                      </div>
                    );
                  })}
                  {/* Add object element */}
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
              {selectedElementIds.length === 0
                ? "No elements selected. Customize a cast member or add an element to feature it."
                : `${selectedElementIds.length} element${selectedElementIds.length > 1 ? "s" : ""} selected · @mention them by name in the next step.`}
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
                {account?.plan === "free" ? (
                  <>
                    Free preview · <span className="font-medium text-white">{previewCost} tokens</span>
                    <span className="text-white/40"> · upgrade for the full video</span>
                  </>
                ) : noPrerender ? (
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
              <div
                className={cn(
                  // Hidden on mobile so "This will use…" gets the full width.
                  "hidden shrink-0 text-[12px] sm:block",
                  (account?.plan === "free" ? brokePreview : broke) ? "text-pulse" : "text-white/45",
                )}
              >
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
            ) : account?.plan === "free" ? (
              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <Button3D
                  className="flex w-full items-center justify-center gap-2 py-3 text-[15px]"
                  disabled={previewing || brokePreview || briefLoading}
                  onClick={onPreviewClick}
                >
                  {previewing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                  {brokePreview ? "Not enough tokens" : "Generate Preview"}
                </Button3D>
                <button
                  type="button"
                  onClick={() => setStep(imageQuality !== "lite" && usableMembers.length > 0 ? "cast" : "settings")}
                  className="mx-auto mt-3 block text-[12px] text-white/40 transition-colors hover:text-white"
                >
                  Back
                </button>
              </div>
            ) : (
              // Mobile: a clean full-width stack, primary (Generate) at the bottom in
              // the thumb zone, Back ghost on top. Desktop: the inline row with Back on
              // the left and Preview + Generate on the right.
              <div className="mt-5 flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <Button3D
                  variant="secondary"
                  className="order-1 w-full whitespace-nowrap sm:order-none sm:w-auto"
                  onClick={() => setStep(imageQuality !== "lite" && usableMembers.length > 0 ? "cast" : "settings")}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button3D>
                <div className="contents sm:flex sm:flex-wrap sm:items-center sm:gap-2">
                  {canPreview && (
                    <Button3D
                      variant="secondary"
                      className="order-2 w-full whitespace-nowrap sm:order-none sm:w-auto"
                      disabled={previewing || submitting || brokePreview || briefLoading}
                      onClick={onPreviewClick}
                    >
                      {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {brokePreview ? "Not enough" : `Preview · ${previewCost}`}
                    </Button3D>
                  )}
                  <Button3D
                    className="order-3 w-full whitespace-nowrap sm:order-none sm:w-auto"
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
    {customizeModal && (
      <CustomizeCastMemberModal
        songId={song.id}
        style={effectiveStyle}
        member={customizeModal.member}
        element={customizeModal.element}
        onClose={() => setCustomizeModal(null)}
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
