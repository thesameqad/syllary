import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "@/hooks/use-reduced-motion";

/** Imperative surface for the tappable @-chips that live OUTSIDE the textarea:
 *  insert a mention at the caret (not appended at the end), every time it's
 *  tapped (a scene can legitimately mention the same subject twice). */
export type MentionTextareaHandle = {
  insertMention: (name: string) => void;
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split `text` into plain/mention runs. Mentions = any occurrence of a known
 *  name (longest first, case-insensitive), with a directly preceding "@" pulled
 *  into the run — mirroring the server's findMentionedNames (which matches bare
 *  names too), so what lights up here is exactly what the pipeline will cast. */
function mentionRuns(text: string, names: string[]): { text: string; mention: boolean }[] {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort(
    (a, b) => b.length - a.length,
  );
  if (!text || clean.length === 0) return [{ text, mention: false }];
  const re = new RegExp(`@?(?:${clean.map(escapeRegExp).join("|")})`, "gi");
  const runs: { text: string; mention: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) runs.push({ text: text.slice(last, i), mention: false });
    runs.push({ text: m[0], mention: true });
    last = i + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), mention: false });
  return runs;
}

/** A textarea with an "@" name-autocomplete. When the caret sits in an `@token`
 *  (at the start or after whitespace), a dropdown of matching `names` appears;
 *  picking one replaces the token with "@Name ". Known names are highlighted
 *  IN PLACE as pills via a mirror overlay (same box/typography, transparent
 *  text, visible pill backgrounds) so "@Emily Chu1 Chu1" reads unambiguously:
 *  the pill covers the mention, the rest is plain text. Used so users can
 *  reference band members/elements by name in briefs and per-scene directions. */
export const MentionTextarea = forwardRef<
  MentionTextareaHandle,
  {
    value: string;
    onChange: (v: string) => void;
    names: string[];
    className?: string;
    rows?: number;
    disabled?: boolean;
    placeholder?: string;
    onBlur?: () => void;
  }
>(function MentionTextarea(
  { value, onChange, names, className, rows, disabled, placeholder, onBlur },
  handleRef,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const overlayInnerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<{ at: number; q: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query && names.length > 0
      ? names.filter((n) => n.toLowerCase().includes(query.q.toLowerCase())).slice(0, 6)
      : [];
  const open = matches.length > 0;

  // Reset the highlight to the top only when the filter text actually changes —
  // NOT on every key-up/click. detect() runs on key-up, so resetting `active`
  // there snapped arrow-key navigation straight back to the first match.
  useEffect(() => {
    setActive(0);
  }, [query?.q]);

  useImperativeHandle(
    handleRef,
    () => ({
      insertMention(name: string) {
        const el = ref.current;
        // Insert at the last-known caret (browsers keep selectionStart across
        // blur, so this lands where the user was typing before the chip tap);
        // replace any selection. Deliberately NO dedupe — a second tap inserts
        // a second mention.
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? start;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
        const trail = after.startsWith(" ") ? "" : " ";
        const insert = `${lead}@${name}${trail}`;
        onChange(before + insert + after);
        const pos = start + insert.length;
        requestAnimationFrame(() => {
          const node = ref.current;
          if (!node) return;
          node.focus();
          node.setSelectionRange(pos, pos);
        });
      },
    }),
    [value, onChange],
  );

  /** Detect an active "@token" ending at the caret (start-of-text or after space,
   *  no whitespace inside). */
  function detect() {
    const el = ref.current;
    if (!el || names.length === 0) return setQuery(null);
    const caret = el.selectionStart ?? 0;
    const before = el.value.slice(0, caret);
    const at = before.lastIndexOf("@");
    if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]!))) return setQuery(null);
    const q = before.slice(at + 1);
    if (/\s/.test(q)) return setQuery(null);
    // Keep the same object reference when nothing changed so caret-only events
    // (key-up, click) don't churn state or disturb the highlighted option.
    setQuery((prev) => (prev && prev.at === at && prev.q === q ? prev : { at, q }));
  }

  function pick(name: string) {
    const el = ref.current;
    if (!el || !query) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, query.at)}@${name} ${value.slice(caret)}`;
    const pos = query.at + name.length + 2; // after "@Name "
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  /** Keep the highlight mirror aligned with the textarea's internal scroll.
   *  The mirror's CONTENT is translated rather than the mirror scrolled —
   *  Safari clamps programmatic scrollTop on overflow:hidden boxes to 0, so a
   *  scrollTop-based sync silently does nothing on iOS. (Textareas scroll
   *  their padding along with the text, and the translated inner starts at
   *  the padded origin, so the coordinate math matches exactly.) */
  function syncScroll() {
    const el = ref.current;
    const inner = overlayInnerRef.current;
    if (el && inner) {
      inner.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
    }
  }
  // Typing can auto-scroll the textarea without a scroll event reaching React
  // in every browser — re-sync after each value render too.
  useEffect(syncScroll, [value]);

  const runs = useMemo(() => mentionRuns(value, names), [value, names]);
  // The pill mirror is desktop-only: on touch devices (iOS especially) the
  // textarea's rendering quirks kept knocking the mirror out of register, so
  // the pills read as broken rather than helpful. Real pointer + hover =
  // desktop; width alone would wrongly include iPads.
  const desktopPointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const hasMention = desktopPointer && runs.some((r) => r.mention);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onScroll={syncScroll}
        onChange={(e) => {
          onChange(e.target.value);
          detect();
        }}
        onKeyUp={(e) => {
          // The open dropdown owns these keys; re-detecting on their key-up would
          // disturb the highlighted option (arrows) or reopen it (Escape).
          if (e.key === "Escape") return;
          if (open && (e.key === "ArrowUp" || e.key === "ArrowDown")) return;
          detect();
        }}
        onClick={detect}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            pick(matches[active] ?? matches[0]!);
          } else if (e.key === "Escape") {
            setQuery(null);
          }
        }}
        onBlur={() => {
          // Delay so an onMouseDown pick on a dropdown item still fires.
          setTimeout(() => setQuery(null), 120);
          onBlur?.();
        }}
      />
      {/* Highlight mirror: the exact text in the exact same box (same classes →
          same font/padding/border metrics) rendered transparent, with a visible
          pill behind each mention. Sits ON TOP of the textarea (pointer-events
          off) so the pill tints the real text underneath — the textarea keeps
          its own background, focus tint, and caret. */}
      {hasMention && (
        <div
          aria-hidden
          className={className}
          style={{
            position: "absolute",
            inset: 0,
            color: "transparent",
            background: "transparent",
            borderColor: "transparent",
            pointerEvents: "none",
            overflow: "hidden",
            // Mobile browsers inflate text in regular blocks but never in form
            // controls — without this the mirror's font runs slightly larger
            // than the textarea's and the pills drift off line by line.
            WebkitTextSizeAdjust: "100%",
            textSizeAdjust: "100%",
          }}
        >
          {/* Translated by syncScroll to mirror the textarea's scroll offset
              (scrollTop on the hidden box itself is a no-op in Safari). */}
          <div
            ref={overlayInnerRef}
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", willChange: "transform" }}
          >
            {runs.map((r, i) =>
              r.mention ? (
                <span
                  key={i}
                  className="rounded-[5px] bg-pulse/25 box-decoration-clone shadow-[inset_0_0_0_1px_rgba(255,45,45,0.35)]"
                >
                  {r.text}
                </span>
              ) : (
                <span key={i}>{r.text}</span>
              ),
            )}
            {/* Match a trailing newline's empty last line. */}
            {"​"}
          </div>
        </div>
      )}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 max-w-full overflow-hidden rounded-[10px] border border-white/10 bg-stage/95 py-1 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur">
          {matches.map((name, i) => (
            <button
              key={name}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                pick(name);
              }}
              className={
                "block w-full truncate px-3 py-1.5 text-left text-[12px] transition-colors " +
                (i === active ? "bg-pulse/[0.14] text-white" : "text-white/75 hover:bg-white/[0.06]")
              }
            >
              @{name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
