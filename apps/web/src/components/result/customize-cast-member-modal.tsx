import { useState } from "react";
import { Loader2, User, Wand2 } from "lucide-react";
import type { BandMember, SongElement } from "@syllary/shared";
import {
  ApiError,
  createElement,
  generateElementImage,
  saveElementImage,
  suggestElementOutfit,
  updateElement,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { AiCoverPanel } from "@/components/result/ai-cover-panel";

const FIELD =
  "w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60";

/** Customize a cast member into a per-song "instance": a locked reference image
 *  generated from the member's photos + an outfit/hair prompt, so their face stays
 *  the same while wardrobe + hair are pinned for this video. The result is just a
 *  song element (with sourceMemberId) — @mentioned by name like any element.
 *
 *  Two-phase, mirroring ElementEditModal: name the instance (created with
 *  sourceMemberId so the image route can condition on the member's photos), then
 *  describe the look and generate. Reopened from an element's menu to edit. */
export function CustomizeCastMemberModal({
  songId,
  style,
  member,
  element: initial,
  onClose,
  onSaved,
}: {
  songId: string;
  /** Chosen video art direction — seeds the "Suggest with AI" outfit. */
  style: string;
  /** The source cast member (creating). Optional when editing an existing instance. */
  member: BandMember | null;
  /** Existing instance when reopened to edit; null when creating. */
  element: SongElement | null;
  onClose: () => void;
  /** Fired on create, rename, and image-save with the up-to-date element. */
  onSaved: (element: SongElement) => void;
}) {
  const toast = useToast();
  const [element, setElement] = useState<SongElement | null>(initial);
  const [name, setName] = useState(initial?.name ?? member?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const memberId = member?.id ?? initial?.sourceMemberId ?? undefined;
  const sourceThumb = member?.images[0]?.url;
  const sourceName = member?.name;

  // Create the instance (with its source member so the image route conditions on
  // that member's photos), then unlock the look panel. Inline-errors on a name clash.
  async function create() {
    const n = name.trim();
    if (!n) return setNameError("Give this look a name.");
    setBusy(true);
    setNameError(null);
    try {
      const created = await createElement(songId, { name: n, sourceMemberId: memberId });
      setElement(created);
      onSaved(created);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNameError("You already have an element with that name for this song.");
      } else {
        toast(e instanceof ApiError ? e.message : "Couldn't create the character.", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  // Persist a rename (on blur) once the instance exists; inline-errors on a clash.
  async function saveNameOnBlur() {
    const n = name.trim();
    if (!element || !n || n === element.name) return;
    try {
      const updated = await updateElement(songId, element.id, { name: n });
      setElement(updated);
      setNameError(null);
      onSaved(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNameError("You already have an element with that name for this song.");
      }
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={initial ? "Edit character" : "Customize character"}
      widthClass="max-w-[560px]"
    >
      {/* Source member hint */}
      {(sourceThumb || sourceName) && (
        <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-white/[0.06] bg-white/[0.02] p-2.5">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-white/10 bg-black/40">
            {sourceThumb ? (
              <img src={sourceThumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User className="h-5 w-5 text-white/25" />
              </div>
            )}
          </div>
          <p className="text-[12px] leading-snug text-white/55">
            Based on <span className="text-white/85">{sourceName ?? "a cast member"}</span> — their
            face is kept; you choose the outfit &amp; hair for this video.
          </p>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
          Name for this look <span className="text-pulse">*</span>
        </span>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          onBlur={() => void saveNameOnBlur()}
          className={FIELD}
          placeholder="e.g. Emily (red dress)"
        />
        {nameError ? (
          <span className="text-[11px] text-pulse">{nameError}</span>
        ) : (
          <span className="text-[11px] text-white/40">
            @mention this name in the brief or a scene (e.g. “@{name.trim() || "Emily"} walks in”).
          </span>
        )}
      </label>

      {element ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {element.imageUrl && (
            <div className="mb-3 flex items-center gap-3">
              <img
                src={element.imageUrl}
                alt={element.name}
                className="h-20 w-12 shrink-0 rounded-[10px] border border-white/10 bg-black/40 object-contain"
              />
              <p className="text-[12px] text-white/55">
                Current look — generate again to replace it.
              </p>
            </div>
          )}
          <AiCoverPanel
            defaultPrompt={element.description ?? ""}
            hideModelPicker
            forcedModel="nano"
            previewAspect="portrait"
            onSuggest={
              memberId ? () => suggestElementOutfit(songId, memberId, style) : undefined
            }
            describeLabel={
              <>
                What are they wearing? <span className="text-pulse">*</span>
              </>
            }
            placeholder="e.g. a flowing red satin dress, gold hoop earrings, hair in loose waves"
            saveLabel="Save character"
            savedToast="Character saved."
            onGenerate={(prompt) => generateElementImage(songId, element.id, prompt, "nano", style)}
            onCommit={async (key) => {
              const updated = await saveElementImage(songId, element.id, key);
              setElement(updated);
              onSaved(updated);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/40">
            <Wand2 className="h-3.5 w-3.5" />
            Name the look, then describe the outfit &amp; hair to generate a locked reference.
          </p>
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void create()}
              className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Continue
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
