import { useEffect, useMemo, useRef, useState } from "react";
import { Play } from "lucide-react";
import { toDisplayLine, type Lyrics, type LyricLine } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import { wordsCoverText } from "@/lib/lyrics";
import { InlineLineEditor } from "@/components/result/inline-line-editor";
import { cn } from "@/lib/utils";

type SectionGroup = {
  label: string | null;
  start: number;
  items: { line: LyricLine; index: number }[];
};

function groupSections(lines: LyricLine[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  lines.forEach((line, index) => {
    const last = groups[groups.length - 1];
    if (!last || (line.section && last.items.length > 0)) {
      groups.push({ label: line.section ?? null, start: line.start, items: [] });
    }
    groups[groups.length - 1]!.items.push({ line, index });
  });
  return groups;
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ActiveWords({ line, time }: { line: LyricLine; time: number }) {
  return (
    <>
      {line.words.map((word, i) => {
        const on = time >= word.start && time < word.end;
        const isLast = i === line.words.length - 1;
        return (
          <span key={i} className={cn(on && "text-pulse")}>
            {isLast ? toDisplayLine(word.text) : word.text}
            {isLast ? "" : " "}
          </span>
        );
      })}
    </>
  );
}

export function SyncedLyrics({
  lyrics,
  currentTime,
  onSeek,
  canEdit = false,
  onSaveLine,
  onEditingChange,
}: {
  lyrics: Lyrics;
  currentTime: number;
  onSeek: (seconds: number) => void;
  canEdit?: boolean;
  onSaveLine?: (lineIndex: number, nextText: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const activeRef = useRef<HTMLSpanElement>(null);
  const sections = useMemo(() => groupSections(lyrics.lines), [lyrics.lines]);
  const activeIndex = lyrics.lines.findIndex(
    (l) => currentTime >= l.start && currentTime < l.end,
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  }, [activeIndex, reduced]);

  if (lyrics.lines.length === 0) {
    return <p className="py-12 text-center text-[15px] text-white/40">No lyrics were detected in this track.</p>;
  }

  return (
    <div className="max-h-[440px] overflow-y-auto pr-1">
      <div className="space-y-7">
        {sections.map((section, si) => {
          const sectionActive =
            activeIndex >= 0 && section.items.some((it) => it.index === activeIndex);
          return (
            <section key={si}>
              {section.label && (
                <button
                  type="button"
                  onClick={() => onSeek(section.start)}
                  title="Play from here"
                  className={cn(
                    "group/sec mb-3 inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 transition-colors",
                    sectionActive
                      ? "border-pulse/50 bg-pulse/10"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-pulse/40",
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full transition-all",
                      sectionActive
                        ? "bg-pulse shadow-[0_0_12px_#FF2D2D]"
                        : "bg-white/30 group-hover/sec:bg-pulse/70",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium uppercase tracking-[2px] transition-colors",
                      sectionActive ? "text-pulse" : "text-white/50 group-hover/sec:text-white/85",
                    )}
                  >
                    {section.label}
                  </span>
                  <span className="font-mono text-[10px] text-white/30">{clock(section.start)}</span>
                  <Play className="h-3 w-3 text-pulse opacity-0 transition-opacity group-hover/sec:opacity-100" />
                </button>
              )}
              <div>
                {section.items.map(({ line, index }) => {
                  const active = index === activeIndex;
                  const isEditing = editingIndex === index;
                  const sizeClass = active
                    ? "text-[19px] font-medium text-white"
                    : "text-[18px] text-white/30 hover:text-white/55";
                  const lineContent =
                    active && wordsCoverText(line) ? (
                      <ActiveWords line={line} time={currentTime} />
                    ) : (
                      toDisplayLine(line.text)
                    );
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
                        align="left"
                        textClassName={
                          active
                            ? "text-[19px] font-medium text-white"
                            : "text-[18px] text-white"
                        }
                      >
                        {lineContent}
                      </InlineLineEditor>
                    ) : (
                      lineContent
                    );
                  return (
                    <div
                      key={index}
                      className={cn(
                        "block w-full text-balance text-left leading-[1.7] transition-all duration-200",
                        sizeClass,
                      )}
                    >
                      {/* Keep the wrapper span mounted across editing
                          transitions so InlineLineEditor's internal state
                          isn't wiped on the first pencil click. */}
                      <span
                        ref={active ? activeRef : undefined}
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
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
