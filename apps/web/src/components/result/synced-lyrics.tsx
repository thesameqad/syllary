import { useEffect, useMemo, useRef } from "react";
import { Play } from "lucide-react";
import type { Lyrics, LyricLine } from "@syllary/shared";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
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
        return (
          <span key={i} className={cn(on && "text-pulse")}>
            {word.text}
            {i < line.words.length - 1 ? " " : ""}
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
}: {
  lyrics: Lyrics;
  currentTime: number;
  onSeek: (seconds: number) => void;
}) {
  const reduced = usePrefersReducedMotion();
  const activeRef = useRef<HTMLButtonElement>(null);
  const sections = useMemo(() => groupSections(lyrics.lines), [lyrics.lines]);
  const activeIndex = lyrics.lines.findIndex(
    (l) => currentTime >= l.start && currentTime < l.end,
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    });
  }, [activeIndex, reduced]);

  if (lyrics.lines.length === 0) {
    return (
      <div className="rounded-[20px] border-[0.5px] border-white/[0.08] bg-stage/40 p-12 text-center">
        <p className="text-[15px] text-white/40">No lyrics were detected in this track.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[560px] overflow-y-auto rounded-[20px] border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0d0d0d_100%)] p-6 sm:p-8">
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
                  return (
                    <button
                      key={index}
                      ref={active ? activeRef : undefined}
                      type="button"
                      onClick={() => onSeek(line.start)}
                      className={cn(
                        "block w-full text-balance text-left leading-[1.7] transition-all duration-200",
                        active
                          ? "text-[19px] font-medium text-white"
                          : "text-[18px] text-white/30 hover:text-white/55",
                      )}
                    >
                      {active && line.words.length > 0 ? (
                        <ActiveWords line={line} time={currentTime} />
                      ) : (
                        line.text
                      )}
                    </button>
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
