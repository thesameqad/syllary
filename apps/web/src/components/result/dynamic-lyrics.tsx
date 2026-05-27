import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toDisplayLine, type Lyrics, type LyricLine } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { wordsCoverText } from "@/lib/lyrics";
import { InlineLineEditor } from "@/components/result/inline-line-editor";
import { cn } from "@/lib/utils";

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function activeWordIndex(line: LyricLine, time: number): number {
  let idx = -1;
  for (let i = 0; i < line.words.length; i++) {
    if (time >= line.words[i]!.start) idx = i;
    else break;
  }
  return idx;
}

const HIGHLIGHT_PAD_X = 8;
const HIGHLIGHT_PAD_Y = 2;

/** Current line with a red rounded highlight that floats from word to word. */
function HighlightLine({ line, time }: { line: LyricLine; time: number }) {
  const reduced = usePrefersReducedMotion();
  const containerRef = useRef<HTMLSpanElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const [box, setBox] = useState({ left: 0, top: 0, width: 0, height: 0, show: false });

  const active = activeWordIndex(line, time);

  const measure = useCallback(() => {
    const c = containerRef.current;
    const el = active >= 0 ? wordRefs.current[active] : null;
    if (!c || !el) {
      setBox((p) => (p.show ? { ...p, show: false } : p));
      return;
    }
    const cr = c.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    setBox({
      left: er.left - cr.left - HIGHLIGHT_PAD_X,
      top: er.top - cr.top - HIGHLIGHT_PAD_Y,
      width: er.width + HIGHLIGHT_PAD_X * 2,
      height: er.height + HIGHLIGHT_PAD_Y * 2,
      show: true,
    });
  }, [active]);

  useLayoutEffect(measure, [measure, line]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  if (!wordsCoverText(line)) return <>{toDisplayLine(line.text)}</>;

  return (
    <span ref={containerRef} className="relative inline">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute rounded-[6px] bg-pulse shadow-[0_0_24px_rgba(255,45,45,0.55)]"
        initial={false}
        animate={{
          left: box.left,
          top: box.top,
          width: box.width,
          height: box.height,
          opacity: box.show ? 1 : 0,
        }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 28 }}
      />
      {line.words.map((word, i) => {
        const isLast = i === line.words.length - 1;
        return (
          <Fragment key={i}>
            <span
              ref={(el) => {
                wordRefs.current[i] = el;
              }}
              className="relative text-white"
            >
              {isLast ? toDisplayLine(word.text) : word.text}
            </span>
            {isLast ? "" : " "}
          </Fragment>
        );
      })}
    </span>
  );
}

export function DynamicLyrics({
  lyrics,
  currentTime,
  onSeek,
  align = "center",
  canEdit = false,
  onSaveLine,
  onEditingChange,
}: {
  lyrics: Lyrics;
  currentTime: number;
  onSeek: (seconds: number) => void;
  align?: "center" | "left";
  canEdit?: boolean;
  onSaveLine?: (lineIndex: number, nextText: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const lines = lyrics.lines;
  const left = align === "left";

  let activeIndex = lines.findIndex((l) => currentTime >= l.start && currentTime < l.end);
  if (activeIndex === -1) {
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i]!.start) idx = i;
      else break;
    }
    activeIndex = idx;
  }

  let sectionLabel: string | null = null;
  let sectionStart = 0;
  for (let i = activeIndex; i >= 0; i--) {
    if (lines[i]?.section) {
      sectionLabel = lines[i]!.section;
      sectionStart = lines[i]!.start;
      break;
    }
  }

  const slots: { index: number; role: "prev" | "current" | "next" }[] = [];
  if (activeIndex - 1 >= 0) slots.push({ index: activeIndex - 1, role: "prev" });
  slots.push({ index: activeIndex, role: "current" });
  if (activeIndex + 1 < lines.length) slots.push({ index: activeIndex + 1, role: "next" });

  const transition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 260, damping: 30 };

  return (
    <div className={cn("flex flex-col", left ? "items-start" : "items-center")}>
      <AnimatePresence mode="popLayout" initial={false}>
        {sectionLabel && (
          <motion.div
            key={sectionLabel + sectionStart}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={transition}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-pulse/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[1.5px] text-[#FF6B6B]"
          >
            <span className="h-[5px] w-[5px] rounded-full bg-pulse" />
            {sectionLabel} · {clock(sectionStart)}
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={cn(
          "relative flex h-[200px] w-full flex-col justify-center gap-3 overflow-hidden",
          left ? "items-start text-left" : "items-center text-center",
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {slots.map(({ index, role }) => {
            const line = lines[index]!;
            const isCurrent = role === "current";
            const isEditing = editingIndex === index;
            const lineContent = isCurrent ? (
              <HighlightLine line={line} time={currentTime} />
            ) : (
              toDisplayLine(line.text)
            );
            const sizeClass = isCurrent
              ? "text-[clamp(20px,3.2vw,28px)] font-medium text-white"
              : "text-[clamp(15px,2.4vw,19px)] text-white/35";
            const editorBody =
              canEdit && onSaveLine ? (
                <InlineLineEditor
                  original={line.text}
                  canEdit={canEdit}
                  onSave={(next) => onSaveLine(index, next)}
                  onEditingChange={(editing) => {
                    setEditingIndex(editing ? index : null);
                    onEditingChange?.(editing);
                  }}
                  align={align}
                  textClassName={sizeClass}
                >
                  {lineContent}
                </InlineLineEditor>
              ) : (
                lineContent
              );
            return (
              <motion.div
                key={index}
                layout
                initial={{ opacity: 0, y: 26, filter: "blur(4px)" }}
                animate={{
                  opacity: isCurrent ? 1 : 0.35,
                  y: 0,
                  filter: "blur(0px)",
                }}
                exit={{ opacity: 0, y: -26, filter: "blur(4px)" }}
                transition={transition}
                className={cn("max-w-full text-balance px-4 leading-snug", sizeClass)}
              >
                {/* Wrapper stays mounted regardless of editing state so that
                    InlineLineEditor's internal state isn't wiped when the
                    user starts an edit. When editing we drop the seek
                    interactions so the input can take focus cleanly. */}
                <span
                  role={isEditing ? undefined : "button"}
                  tabIndex={isEditing ? -1 : 0}
                  onClick={isEditing ? undefined : () => onSeek(line.start)}
                  onKeyDown={
                    isEditing
                      ? undefined
                      : (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSeek(line.start);
                          }
                        }
                  }
                  className={cn(
                    "inline text-inherit",
                    isEditing ? "" : "cursor-pointer",
                  )}
                >
                  {editorBody}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
