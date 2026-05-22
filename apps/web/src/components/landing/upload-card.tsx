import { useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";
import gsap from "gsap";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, FileAudio, Loader2, Upload, X } from "lucide-react";
import { creditCost, isAcceptedExtension, MAX_DURATION_SECONDS, MAX_FILE_BYTES } from "@syllary/shared";
import { ApiError, uploadAndProcess } from "@/lib/api";
import { extractMetadata, type AudioMeta } from "@/lib/metadata";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

type Phase = "idle" | "selected" | "uploading";

type UploadCardProps = {
  mode?: "anonymous" | "credits";
  /** Current credit balance, for cost validation in credits mode. */
  credits?: number | null;
  /** Called after processing starts (credits mode); otherwise we go to /s/:id. */
  onStarted?: (songId: string) => void;
};

export function UploadCard({ mode = "anonymous", credits = null, onStarted }: UploadCardProps) {
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<AudioMeta | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState("Uploading…");
  const [error, setError] = useState<string | null>(null);

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 150, damping: 15 });
  const springY = useSpring(rotateY, { stiffness: 150, damping: 15 });

  const isCredits = mode === "credits";
  const cost = meta ? creditCost(meta.durationSeconds ?? 60) : 0;
  const tooExpensive = isCredits && credits != null && cost > credits;

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (reduced || phase !== "idle") return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    rotateY.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    rotateX.set(-((e.clientY - r.top) / r.height - 0.5) * 10);
  }

  function resetTilt() {
    rotateX.set(0);
    rotateY.set(0);
  }

  function burst(x: number, y: number) {
    if (reduced) return;
    const host = cardRef.current;
    if (!host) return;
    for (let i = 0; i < 24; i++) {
      const dot = document.createElement("span");
      dot.className = "pointer-events-none absolute z-20 h-1.5 w-1.5 rounded-full";
      dot.style.background = "#FF2D2D";
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      host.appendChild(dot);
      const angle = (i / 24) * Math.PI * 2;
      const dist = 60 + Math.random() * 40;
      gsap.to(dot, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        opacity: 0,
        scale: 0,
        duration: 0.3 + Math.random() * 0.2,
        ease: "power2.out",
        onComplete: () => dot.remove(),
      });
    }
  }

  async function accept(f: File, point?: { x: number; y: number }) {
    setError(null);
    if (!isAcceptedExtension(f.name)) {
      setError("Use an MP3, WAV, or FLAC file.");
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setError("That file is over 60MB.");
      return;
    }
    const m = await extractMetadata(f);
    if (!isCredits && m.durationSeconds !== null && m.durationSeconds > MAX_DURATION_SECONDS + 1) {
      setError("Free preview supports tracks up to 3 minutes. Sign up to remove the limit.");
      return;
    }
    setFile(f);
    setMeta(m);
    setPhase("selected");
    resetTilt();
    const host = cardRef.current;
    if (host) {
      const r = host.getBoundingClientRect();
      burst(point ? point.x - r.left : r.width / 2, point ? point.y - r.top : r.height / 2);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void accept(f, { x: e.clientX, y: e.clientY });
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) void accept(f);
  }

  async function startProcessing() {
    if (!file || !meta) return;
    setPhase("uploading");
    setProgress(0);
    setStatusLabel("Uploading…");
    setError(null);
    try {
      const songId = await uploadAndProcess(
        file,
        {
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          year: meta.year,
          durationSeconds: meta.durationSeconds,
          cover: meta.cover,
        },
        setProgress,
      );
      if (onStarted) onStarted(songId);
      else navigate(`/s/${songId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setPhase("selected");
    }
  }

  function reset() {
    setFile(null);
    setMeta(null);
    setError(null);
    setProgress(0);
    setPhase("idle");
  }

  return (
    <motion.div
      ref={cardRef}
      data-cursor="interactive"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onDragOver={(e) => {
        if (phase !== "idle") return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => phase === "idle" && onDrop(e)}
      style={{ rotateX: springX, rotateY: springY, transformPerspective: 1000 }}
      className="relative mx-auto max-w-[480px] rounded-[20px] border-[0.5px] border-white/10 bg-[#0f0f0f]/60 p-7 [transform-style:preserve-3d] backdrop-blur-xl"
    >
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac"
        className="hidden"
        onChange={onInputChange}
      />
      <AnimatePresence mode="wait">
        {phase === "idle" ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "rounded-[14px] border-2 border-dashed p-8 text-center transition-colors duration-200",
              dragging ? "border-pulse bg-pulse/5" : "border-white/15 hover:border-pulse/60",
            )}
          >
            <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] shadow-[0_8px_32px_rgba(255,45,45,0.4)]">
              <Upload className="h-6 w-6 text-white" strokeWidth={2.2} />
            </span>
            <h3 className="text-[17px] font-medium text-white">Drop your track here</h3>
            <p className="mb-[18px] mt-1 text-[13px] text-white/40">
              MP3, WAV, or FLAC{isCredits ? "" : " · up to 3 min"}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-full bg-pulse px-7 py-3 text-[14px] font-medium text-white shadow-[0_4px_24px_rgba(255,45,45,0.5)] transition-transform hover:scale-[1.03]"
            >
              Choose file
            </button>
            {error ? (
              <p className="mt-3 text-[12px] text-pulse">{error}</p>
            ) : (
              !isCredits && (
                <div className="mt-[18px] flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[12px] text-white/40">
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3 text-success" /> 1 free song
                  </span>
                  <span className="text-white/15">·</span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3 text-success" /> No sign-up
                  </span>
                  <span className="text-white/15">·</span>
                  <span className="flex items-center gap-1">
                    <Check className="h-3 w-3 text-success" /> up to 3 min
                  </span>
                </div>
              )
            )}
          </motion.div>
        ) : (
          <motion.div
            key="active"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="rounded-[14px] border border-white/10 bg-white/[0.02] p-5"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] shadow-[0_4px_16px_rgba(255,45,45,0.4)]">
                <FileAudio className="h-5 w-5 text-white" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[14px] font-medium text-white">
                  {meta?.title || file?.name}
                </span>
                <span className="block text-[12px] text-white/40">
                  {file ? formatBytes(file.size) : ""}
                  {meta?.durationSeconds ? ` · ${formatDuration(meta.durationSeconds)}` : ""}
                </span>
              </span>
              {phase === "selected" && (
                <button
                  type="button"
                  onClick={reset}
                  aria-label="Remove file"
                  className="flex h-8 w-8 items-center justify-center rounded-full border-[0.5px] border-white/10 text-white/50 transition-colors hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {phase === "uploading" ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-[12px] text-white/50">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
                    {statusLabel}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-pulse"
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void startProcessing()}
                  disabled={tooExpensive}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-pulse py-3 text-[14px] font-medium text-white shadow-[0_4px_24px_rgba(255,45,45,0.5)] transition-transform hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                >
                  {isCredits ? (
                    <>
                      Get lyrics
                      <span className="rounded-full bg-black/25 px-2 py-0.5 text-[12px]">
                        {cost} tokens
                      </span>
                    </>
                  ) : (
                    <>
                      Get my lyric files
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                {tooExpensive && (
                  <p className="mt-2 text-center text-[12px] text-pulse">
                    Not enough credits ({credits} left). Upgrade to continue.
                  </p>
                )}
                {error && <p className="mt-3 text-center text-[12px] text-pulse">{error}</p>}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
