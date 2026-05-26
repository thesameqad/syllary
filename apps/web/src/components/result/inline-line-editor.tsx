import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline editor for a single lyric line.
 *
 * Read-only state shows the line content (passed as children) with a small
 * pencil button revealed on hover. Editing state replaces the content with a
 * full-width input and stacks Save / Cancel buttons *below* so they remain
 * visible even when the line wraps onto multiple visual rows.
 *
 * Enter saves; Escape cancels; clicking elsewhere also saves. The parent
 * decides what `save` does (typically: rebuild the full lyrics document and
 * PATCH /songs/:id/lyrics). Throw from `onSave` to keep the editor open with
 * the user's draft intact.
 */
export function InlineLineEditor({
  original,
  canEdit,
  onSave,
  onEditingChange,
  align = "center",
  textClassName,
  children,
}: {
  original: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void>;
  onEditingChange?: (editing: boolean) => void;
  align?: "center" | "left";
  textClassName?: string;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(original);
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Guard against double-commit: blur after a Save/Cancel click would re-fire
  // the commit logic. Track whether we've already initiated a commit.
  const finishingRef = useRef(false);

  useEffect(() => {
    if (editing) {
      onEditingChange?.(true);
      finishingRef.current = false;
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
      return () => window.clearTimeout(id);
    }
    onEditingChange?.(false);
    return undefined;
  }, [editing, onEditingChange]);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setDraft(original);
    setEditing(true);
  }

  function cancel() {
    finishingRef.current = true;
    setDraft(original);
    setEditing(false);
  }

  async function commit() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    const next = draft.trim();
    if (!next || next === original) {
      setDraft(original);
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setBusy(false);
      setEditing(false);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1200);
    } catch {
      // Keep the editor open so the user can retry. Parent surfaces the toast.
      setBusy(false);
      finishingRef.current = false;
    }
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      void commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }

  if (!canEdit) return <>{children}</>;

  if (editing) {
    return (
      <span
        className={cn(
          "inline-flex w-full flex-col gap-2",
          align === "left" ? "items-start" : "items-stretch",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={draft}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => void commit()}
          className={cn(
            "w-full rounded-md border border-pulse/60 bg-pulse/[0.08] px-2 py-1 text-white outline-none focus:border-pulse",
            align === "left" ? "text-left" : "text-center",
            textClassName,
          )}
        />
        <span
          className={cn(
            "inline-flex items-center gap-2",
            align === "left" ? "self-start" : "self-center",
          )}
        >
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-white/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-pulse" />
              Saving…
            </span>
          ) : (
            <>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown beats the input's blur so we don't race a
                  // commit with the cancel.
                  e.preventDefault();
                  e.stopPropagation();
                  cancel();
                }}
                aria-label="Cancel edit"
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/70 transition-colors hover:border-white/30 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </button>
              <button
                type="button"
                onMouseDown={(e) => {
                  // Same: commit before the blur fires.
                  e.preventDefault();
                  e.stopPropagation();
                  void commit();
                }}
                aria-label="Save edit"
                className="inline-flex items-center gap-1 rounded-md bg-pulse px-2.5 py-1 text-[12px] font-medium text-white shadow-[0_4px_16px_rgba(255,45,45,0.35)] transition-transform hover:scale-[1.03]"
              >
                <Check className="h-3.5 w-3.5" />
                Save
              </button>
            </>
          )}
        </span>
      </span>
    );
  }

  return (
    <span className="group/edit relative inline-flex items-center gap-1.5">
      {children}
      {justSaved ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          aria-label="Edit this line"
          title="Edit this line"
          className="opacity-0 transition-opacity group-hover/edit:opacity-100 motion-safe:hover:scale-110 focus-visible:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5 text-white/55 hover:text-pulse" />
        </button>
      )}
    </span>
  );
}
