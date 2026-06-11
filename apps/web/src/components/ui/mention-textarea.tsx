import { useRef, useState } from "react";

/** A textarea with an "@" name-autocomplete. When the caret sits in an `@token`
 *  (at the start or after whitespace), a dropdown of matching `names` appears;
 *  picking one replaces the token with "@Name ". Used so users can reference band
 *  members by name in briefs and per-scene directions. */
export function MentionTextarea({
  value,
  onChange,
  names,
  className,
  rows,
  disabled,
  placeholder,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  names: string[];
  className?: string;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  onBlur?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ at: number; q: string } | null>(null);
  const [active, setActive] = useState(0);

  const matches =
    query && names.length > 0
      ? names.filter((n) => n.toLowerCase().includes(query.q.toLowerCase())).slice(0, 6)
      : [];
  const open = matches.length > 0;

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
    setQuery({ at, q });
    setActive(0);
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

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          detect();
        }}
        onKeyUp={detect}
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
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 max-w-full overflow-hidden rounded-[10px] border border-white/10 bg-stage/95 py-1 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur">
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
}
