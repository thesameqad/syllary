import { useState } from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import type { SongElement } from "@syllary/shared";
import {
  ApiError,
  createElement,
  generateElementImage,
  saveElementImage,
  updateElement,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { AiCoverPanel } from "@/components/result/ai-cover-panel";

const FIELD =
  "w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60";

/** Create or edit a per-song persisted element: a name + an AI-generated reference
 *  image (reuses the cover-generation panel — same models + pricing). The element is
 *  created first so the image route has its id, then the image panel unlocks —
 *  mirrors MemberEditModal's create-then-gallery flow. */
export function ElementEditModal({
  songId,
  element: initial,
  onClose,
  onSaved,
}: {
  songId: string;
  element: SongElement | null;
  onClose: () => void;
  /** Fired on create, rename, and image-save with the up-to-date element. */
  onSaved: (element: SongElement) => void;
}) {
  const toast = useToast();
  const [element, setElement] = useState<SongElement | null>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [busy, setBusy] = useState(false);

  // Create the element, then unlock its image panel (the image route needs its id).
  async function create() {
    const n = name.trim();
    if (!n) return toast("Give the element a name.", "error");
    setBusy(true);
    try {
      const created = await createElement(songId, { name: n });
      setElement(created);
      onSaved(created);
      toast("Element created — now generate its image.");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't create the element.", "error");
    } finally {
      setBusy(false);
    }
  }

  // Persist a rename silently (on blur) once the element exists.
  async function saveNameOnBlur() {
    const n = name.trim();
    if (!element || !n || n === element.name) return;
    try {
      const updated = await updateElement(songId, element.id, { name: n });
      setElement(updated);
      onSaved(updated);
    } catch {
      // best-effort; the user can retry
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={element ? "Edit element" : "New element"}
      widthClass="max-w-[560px]"
    >
      <label className="flex flex-col gap-1">
        <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
          Name <span className="text-pulse">*</span>
        </span>
        <input
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveNameOnBlur()}
          className={FIELD}
          placeholder="e.g. Rex (the dog), red headphones, the tour van"
        />
        <span className="text-[11px] text-white/40">
          Refer to it by this name in the brief or a scene (e.g. “@{name.trim() || "Rex"} runs
          ahead”).
        </span>
      </label>

      {element ? (
        <div className="mt-4 border-t border-white/[0.06] pt-4">
          {element.imageUrl && (
            <div className="mb-3 flex items-center gap-3">
              <img
                src={element.imageUrl}
                alt={element.name}
                className="h-16 w-16 shrink-0 rounded-[10px] border border-white/10 object-cover"
              />
              <p className="text-[12px] text-white/55">
                Current reference image — generate again to replace it.
              </p>
            </div>
          )}
          <AiCoverPanel
            defaultPrompt={element.description ?? ""}
            describeLabel={
              <>
                Describe this element <span className="text-pulse">*</span>
              </>
            }
            placeholder="e.g. a scruffy brown terrier with a red collar, friendly expression"
            saveLabel="Save image"
            savedToast="Element image saved."
            onGenerate={(prompt, model) => generateElementImage(songId, element.id, prompt, model)}
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
            <ImageIcon className="h-3.5 w-3.5" />
            Create the element, then generate its reference image (cheap or premium model).
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
              Create
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
