import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Pause,
  Play,
  Save,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { type LyricLine, type Lyrics, type Song } from "@syllary/shared";
import { ApiError, syncSongLyrics } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// Smallest a word's on-screen duration can shrink to via trim. Below this the
// block becomes unclickable; this floor keeps it grabbable.
const MIN_WORD_DURATION = 0.04;
const MIN_PX_PER_SEC = 30;
const MAX_PX_PER_SEC = 1200;
const DEFAULT_PX_PER_SEC = 140;
// Padding seconds after the last word so the user can drag right beyond the
// final word if needed (and so the playhead at song-end is still in view).
const TRAIL_PADDING = 0.5;
// How much of the visible viewport's width we keep ahead of the playhead
// before auto-scrolling. 0.7 = playhead can wander to 70% of the visible
// width before scroll kicks in (gives upcoming words context).
const PLAYHEAD_LEAD_RATIO = 0.7;

type DragMode = "move" | "trim-left" | "trim-right";

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function timeLabel(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

export function ManualSyncEditor({
  open,
  song,
  onClose,
  onSaved,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  onSaved: (song: Song) => void;
}) {
  const toast = useToast();
  const wsContainerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const trackScrollRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<LyricLine[]>([]);
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [playhead, setPlayhead] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  // Word the pointer is hovering over — drives delete affordances and the
  // keyboard Delete/Backspace shortcut.
  const [hoveredWord, setHoveredWord] = useState<{ li: number; wi: number } | null>(null);
  // Snapshot of the lines on open so we can detect "dirty" + reset on cancel.
  const initialLinesRef = useRef<string>("");

  // Reset state every time the editor is opened with a fresh song.
  useEffect(() => {
    if (!open) return;
    const clone = structuredClone(song.lyrics?.lines ?? []);
    setLines(clone);
    initialLinesRef.current = JSON.stringify(clone);
    setPxPerSec(DEFAULT_PX_PER_SEC);
    setPlayhead(0);
  }, [open, song.lyrics]);

  // Initialize WaveSurfer for the seek-able waveform + audio playback. One
  // engine handles both the visualisation and the audio so the playhead in
  // the word track always agrees with where the user clicked on the wave.
  useEffect(() => {
    if (!open || !song.audioUrl) return;
    const container = wsContainerRef.current;
    if (!container) return;
    const ws = WaveSurfer.create({
      container,
      url: song.audioUrl,
      height: 48,
      waveColor: "rgba(255,255,255,0.22)",
      progressColor: "#FF2D2D",
      // Wavesurfer's built-in cursor doubles as the "caret" on the waveform —
      // a thin white line that follows playback (and snaps to clicks).
      cursorColor: "rgba(255,255,255,0.85)",
      cursorWidth: 1,
      barWidth: 2,
      barGap: 2,
      barRadius: 2,
      normalize: true,
    });
    wsRef.current = ws;
    const onTime = (t: number) => setPlayhead(t);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onFinish = () => setIsPlaying(false);
    ws.on("timeupdate", onTime);
    ws.on("play", onPlay);
    ws.on("pause", onPause);
    ws.on("finish", onFinish);
    // `interaction` fires for clicks on the waveform with the seeked-to time.
    ws.on("interaction", (t: number) => setPlayhead(t));

    return () => {
      ws.destroy();
      wsRef.current = null;
    };
  }, [open, song.audioUrl]);

  // The whole song occupies the timeline. Use the song's duration if known,
  // otherwise fall back to the envelope of the last word so we still render
  // something sensible on legacy rows.
  const songDuration = useMemo(() => {
    if (song.durationSeconds && song.durationSeconds > 0) return song.durationSeconds;
    let max = 0;
    for (const l of lines) for (const w of l.words) if (w.end > max) max = w.end;
    return Math.max(1, max);
  }, [song.durationSeconds, lines]);

  const viewEnd = songDuration + TRAIL_PADDING;
  const trackWidthPx = viewEnd * pxPerSec;
  const dirty = JSON.stringify(lines) !== initialLinesRef.current;

  const pauseForEdit = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.isPlaying()) ws.pause();
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      const ws = wsRef.current;
      if (!ws) return;
      const t = clamp(time, 0, songDuration);
      ws.setTime(t);
      setPlayhead(t);
    },
    [songDuration],
  );

  const togglePlay = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    void ws.playPause();
  }, []);

  // Spacebar = play/pause; Escape closes; Delete/Backspace removes the
  // currently-hovered word (intentionally not the "selected" word — there
  // isn't one; hover is the targeting affordance).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "Escape" && !saving) {
        onClose();
      } else if ((e.key === "Delete" || e.key === "Backspace") && hoveredWord) {
        e.preventDefault();
        deleteWord(hoveredWord.li, hoveredWord.wi);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, togglePlay, onClose, saving, hoveredWord]);

  // Keep the playhead in view at all times — works for both playback and
  // manual seeks (waveform click, track click). When the playhead would
  // leave the visible window, scroll so it lands at ~25% from the left so
  // there's upcoming context, CapCut-style. Uses instant scroll during
  // playback (smooth feels laggy at 60Hz updates) and smooth on a one-off
  // seek for a nicer feel.
  useEffect(() => {
    const el = trackScrollRef.current;
    if (!el) return;
    const playheadX = playhead * pxPerSec;
    const visibleStart = el.scrollLeft;
    const visibleEnd = el.scrollLeft + el.clientWidth;
    const lead = el.clientWidth * PLAYHEAD_LEAD_RATIO;
    const offScreen =
      playheadX < visibleStart + 20 || playheadX > visibleStart + lead;
    if (!offScreen && playheadX <= visibleEnd) return;
    el.scrollTo({
      left: Math.max(0, playheadX - el.clientWidth * 0.25),
      behavior: isPlaying ? "auto" : "smooth",
    });
  }, [playhead, pxPerSec, isPlaying]);

  function updateWord(
    lineIdx: number,
    wordIdx: number,
    patch: Partial<{ start: number; end: number }>,
  ) {
    setLines((prev) =>
      prev.map((l, li) => {
        if (li !== lineIdx) return l;
        const words = l.words.map((w, wi) =>
          wi === wordIdx ? { ...w, ...patch } : w,
        );
        // Keep line.start/end as the envelope of its words so the karaoke /
        // dynamic views still trigger at the right moment.
        const lineStart = words.length > 0 ? Math.min(...words.map((w) => w.start)) : l.start;
        const lineEnd = words.length > 0 ? Math.max(...words.map((w) => w.end)) : l.end;
        return { ...l, words, start: lineStart, end: lineEnd };
      }),
    );
  }

  // Remove a word from its line. Also rewrites line.text so the lyrics view
  // and the downloadable formats stay in sync with the timed words. If the
  // line's last word was removed, drop the whole line — keeping an empty
  // line around would still surface in the dynamic / synced views (which
  // render line.text), even though it has nothing on the timeline.
  function deleteWord(lineIdx: number, wordIdx: number) {
    pauseForEdit();
    setLines((prev) => {
      const out: LyricLine[] = [];
      for (let li = 0; li < prev.length; li++) {
        const l = prev[li]!;
        if (li !== lineIdx) {
          out.push(l);
          continue;
        }
        const words = l.words.filter((_, wi) => wi !== wordIdx);
        if (words.length === 0) continue; // drop the line entirely
        const text = words.map((w) => w.text).join(" ").trim();
        const lineStart = Math.min(...words.map((w) => w.start));
        const lineEnd = Math.max(...words.map((w) => w.end));
        out.push({ ...l, words, text, start: lineStart, end: lineEnd });
      }
      return out;
    });
    setHoveredWord(null);
  }

  function beginDrag(
    lineIdx: number,
    wordIdx: number,
    mode: DragMode,
    e: React.PointerEvent<HTMLDivElement>,
  ) {
    e.preventDefault();
    e.stopPropagation();
    pauseForEdit();
    const word = lines[lineIdx]?.words[wordIdx];
    if (!word) return;
    const startX = e.clientX;
    const origStart = word.start;
    const origEnd = word.end;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore — drag still works via window listeners
    }

    function onMove(ev: PointerEvent) {
      const dt = (ev.clientX - startX) / pxPerSec;
      if (mode === "move") {
        const dur = origEnd - origStart;
        const ns = clamp(origStart + dt, 0, songDuration - dur);
        updateWord(lineIdx, wordIdx, { start: ns, end: ns + dur });
      } else if (mode === "trim-left") {
        const ns = clamp(origStart + dt, 0, origEnd - MIN_WORD_DURATION);
        updateWord(lineIdx, wordIdx, { start: ns });
      } else {
        const ne = clamp(origEnd + dt, origStart + MIN_WORD_DURATION, songDuration);
        updateWord(lineIdx, wordIdx, { end: ne });
      }
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // The target element here is rendered at full timeline width inside the
  // scroll container, so its getBoundingClientRect().left already accounts
  // for any horizontal scroll. Adding scrollLeft would double-count.
  function timeAtClientX(e: React.MouseEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left) / pxPerSec);
  }

  // Click on the empty track area (between word blocks) = seek to that time.
  function onTrackClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    seekTo(timeAtClientX(e));
  }

  // Click on the time ruler = seek there. Tick marks live inside but have
  // pointer-events disabled below, so currentTarget is reliably the ruler.
  function onRulerClick(e: React.MouseEvent<HTMLDivElement>) {
    seekTo(timeAtClientX(e));
  }

  async function save() {
    setSaving(true);
    try {
      // Normalise every line's text from its words so the displayed lyrics
      // (dynamic + synced views) can never desync from the timeline. Without
      // this, a line whose original text contained more words than `words`
      // (or extra punctuation) would still show the deleted word even after
      // it was removed from the timeline — the dynamic view falls back to
      // raw text when wordsCoverText() returns false, which is exactly the
      // shape an incomplete edit produces. Also drop any line whose words
      // array is empty — those would otherwise appear as ghost text lines in
      // the player even though they have nothing on the timeline.
      const normalisedLines: LyricLine[] = lines.flatMap((l) => {
        if (l.words.length === 0) return [];
        const rebuilt = l.words.map((w) => w.text).join(" ").trim();
        if (!rebuilt) return [];
        return [{ ...l, text: rebuilt }];
      });
      const payload: Lyrics = {
        language: song.lyrics?.language ?? null,
        lines: normalisedLines,
      };
      const updated = await syncSongLyrics(song.id, payload);
      toast("Timing saved.");
      onSaved(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save timing.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    if (dirty && !window.confirm("Discard your timing changes?")) return;
    onClose();
  }

  // --- Render -------------------------------------------------------------

  const playheadX = playhead * pxPerSec;

  // Tick density scales with zoom so labels never crowd. At ≥400 px/s we
  // mark every 100 ms and label every 500 ms; at low zoom we label seconds.
  const { tickEvery, labelEvery } =
    pxPerSec >= 400
      ? { tickEvery: 0.1, labelEvery: 0.5 }
      : pxPerSec >= 150
        ? { tickEvery: 0.25, labelEvery: 1 }
        : pxPerSec >= 60
          ? { tickEvery: 0.5, labelEvery: 2 }
          : { tickEvery: 1, labelEvery: 5 };
  const ticks: { t: number; major: boolean }[] = [];
  for (let t = 0; t <= viewEnd + 0.0001; t += tickEvery) {
    const rounded = Math.round(t / tickEvery) * tickEvery;
    const major = Math.abs(rounded / labelEvery - Math.round(rounded / labelEvery)) < 0.001;
    ticks.push({ t: rounded, major });
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[110] flex flex-col bg-void text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Header */}
          <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3.5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                disabled={saving}
                className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-pulse/15 text-pulse">
                <Wand2 className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-[15px] font-medium tracking-[-0.2px]">
                Fine-tune timing
              </h2>
              <span className="hidden text-[12px] text-white/40 sm:inline">
                · {song.originalFilename}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-1 py-1 text-[12px] text-white/70">
                <button
                  type="button"
                  onClick={() => setPxPerSec((p) => clamp(p - 60, MIN_PX_PER_SEC, MAX_PX_PER_SEC))}
                  aria-label="Zoom out"
                  className="rounded-full p-1 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-1 font-mono text-[11px] text-white/55">
                  {Math.round(pxPerSec)}px/s
                </span>
                <button
                  type="button"
                  onClick={() => setPxPerSec((p) => clamp(p + 60, MIN_PX_PER_SEC, MAX_PX_PER_SEC))}
                  aria-label="Zoom in"
                  className="rounded-full p-1 transition-colors hover:bg-white/[0.06] hover:text-white"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
              <button
                type="button"
                disabled={saving || !dirty}
                onClick={() => void save()}
                className="inline-flex items-center gap-2 rounded-full bg-pulse px-5 py-2 text-[13px] font-medium text-white shadow-[0_4px_18px_rgba(255,45,45,0.35)] transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Saving…" : "Save timing"}
              </button>
            </div>
          </header>

          {/* Timeline — fills the entire width of the screen. */}
          <main className="flex flex-1 flex-col overflow-hidden bg-stage/60">
            <div className="flex flex-1 flex-col px-5 py-5">
              <div className="mb-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.1]"
                >
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaying ? "Pause" : "Play"}
                </button>
                {/* Click-to-seek waveform — wavesurfer owns audio playback and
                    the caret/cursor that follows it. */}
                <div
                  ref={wsContainerRef}
                  className="min-w-0 flex-1 cursor-pointer overflow-hidden rounded-md border border-white/[0.06] bg-black/40 px-2"
                  title="Click to jump to that moment"
                />
                <div className="shrink-0 font-mono text-[12px] text-white/55">
                  {timeLabel(playhead)} <span className="text-white/25">/</span> {timeLabel(songDuration)}
                </div>
              </div>

              <div
                ref={trackScrollRef}
                className="relative flex-1 overflow-x-auto overflow-y-hidden rounded-[12px] border border-white/[0.06] bg-black/30"
              >
                <div className="relative" style={{ width: `${trackWidthPx}px`, minWidth: "100%" }}>
                  {/* Time ruler — also a click-to-seek surface. */}
                  <div
                    onClick={onRulerClick}
                    title="Click to jump to this time"
                    className="sticky top-0 z-10 h-7 cursor-pointer border-b border-white/[0.05] bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/55"
                  >
                    {ticks.map(({ t, major }) => {
                      const x = t * pxPerSec;
                      return (
                        <div
                          key={t.toFixed(3)}
                          className="pointer-events-none absolute top-0 flex flex-col items-center"
                          style={{ left: `${x}px` }}
                        >
                          <div
                            className={cn(
                              "w-px",
                              major ? "h-3 bg-white/30" : "h-1.5 bg-white/15",
                            )}
                          />
                          {major && (
                            <span className="mt-0.5 font-mono text-[9.5px] text-white/40">
                              {t.toFixed(t < 10 ? 1 : 0)}s
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Word blocks track */}
                  <div
                    className="relative h-[140px] cursor-crosshair"
                    onClick={onTrackClick}
                  >
                    {/* Faint envelope tints per line so the user can see line
                        boundaries even while editing all words at once. */}
                    {lines.map((line, li) => {
                      if (line.words.length === 0) return null;
                      const left = line.start * pxPerSec;
                      const width = Math.max(0, (line.end - line.start) * pxPerSec);
                      // Alternating subtle tint so adjacent lines are visually
                      // distinguishable without screaming colors.
                      const tint = li % 2 === 0 ? "bg-pulse/[0.04]" : "bg-white/[0.025]";
                      return (
                        <div
                          key={`env-${li}`}
                          className={cn(
                            "pointer-events-none absolute top-1 bottom-1 rounded-md ring-1 ring-inset ring-white/[0.04]",
                            tint,
                          )}
                          style={{ left: `${left}px`, width: `${width}px` }}
                          title={line.text}
                        >
                          {pxPerSec >= 90 && (
                            <span className="absolute left-1.5 top-1 truncate text-[10px] uppercase tracking-[1px] text-white/30">
                              {line.text}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {lines.map((line, li) =>
                      line.words.map((word, wi) => {
                        const left = word.start * pxPerSec;
                        const width = Math.max(8, (word.end - word.start) * pxPerSec);
                        return (
                          <div
                            key={`${li}-${wi}`}
                            onPointerEnter={() => setHoveredWord({ li, wi })}
                            onPointerLeave={() =>
                              setHoveredWord((prev) =>
                                prev && prev.li === li && prev.wi === wi ? null : prev,
                              )
                            }
                            className="group absolute top-5 bottom-5 rounded-md border border-pulse/40 bg-gradient-to-b from-pulse/40 to-pulse/15 shadow-[0_4px_16px_rgba(255,45,45,0.18)] transition-colors hover:border-pulse hover:from-pulse/55"
                            style={{ left: `${left}px`, width: `${width}px` }}
                          >
                            {/* Left trim handle */}
                            <div
                              onPointerDown={(e) => beginDrag(li, wi, "trim-left", e)}
                              className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md bg-white/15 transition-colors hover:bg-white/40"
                              title="Drag to change start time"
                            />
                            {/* Body (move) */}
                            <div
                              onPointerDown={(e) => beginDrag(li, wi, "move", e)}
                              className="absolute left-2 right-2 top-0 bottom-0 cursor-grab select-none active:cursor-grabbing"
                            >
                              <div className="flex h-full items-center justify-center overflow-hidden px-1">
                                <span className="truncate font-medium text-[12px] text-white">
                                  {word.text}
                                </span>
                              </div>
                            </div>
                            {/* Right trim handle */}
                            <div
                              onPointerDown={(e) => beginDrag(li, wi, "trim-right", e)}
                              className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md bg-white/15 transition-colors hover:bg-white/40"
                              title="Drag to change end time"
                            />
                            {/* Delete button — sits slightly outside the
                                top-right corner so it's still clickable on
                                very narrow blocks. Hidden until hover. */}
                            <button
                              type="button"
                              onPointerDown={(e) => {
                                // Beat the drag-handler pointerdown on the parent.
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteWord(li, wi);
                              }}
                              aria-label={`Delete word "${word.text}"`}
                              title={`Delete "${word.text}"`}
                              className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-stage text-white/70 opacity-0 shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-all hover:scale-110 hover:border-pulse hover:bg-pulse hover:text-white focus-visible:opacity-100 group-hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                            {/* Timing readout on hover */}
                            <div className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 font-mono text-[10px] text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
                              {word.start.toFixed(2)}s – {word.end.toFixed(2)}s
                            </div>
                          </div>
                        );
                      }),
                    )}

                    {/* Playhead */}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-white"
                      style={{ left: `${playheadX}px` }}
                    >
                      <div className="absolute -top-1 -left-[5px] h-0 w-0 border-x-[5px] border-t-[6px] border-x-transparent border-t-white" />
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-3 text-center text-[12px] text-white/40">
                Drag to move · Drag the edges to trim · Hover and click{" "}
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-white/15 align-text-bottom text-[9px] text-white/70">
                  ×
                </span>{" "}
                (or press{" "}
                <kbd className="rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-white/70">Del</kbd>
                ) to remove a word ·{" "}
                <kbd className="rounded border border-white/15 bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10.5px] text-white/70">Space</kbd>{" "}
                plays / pauses · Click waveform or ruler to scrub
              </p>
            </div>
          </main>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
