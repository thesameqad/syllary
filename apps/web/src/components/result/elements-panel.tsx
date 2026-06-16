import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import type { Song, SongElement } from "@syllary/shared";
import { ApiError, deleteElement, listElements } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { ElementEditModal } from "@/components/dashboard/element-edit-modal";

/** The song's persisted-element catalog, shown in edit mode. Elements are
 *  mention-driven — you don't "select" them here; just create them, then @mention
 *  any by name in the brief or a scene direction and regenerate to include it. This
 *  panel manages the catalog (add / edit / regenerate image / delete). */
export function ElementsPanel({ song }: { song: Song }) {
  const toast = useToast();
  const [elements, setElements] = useState<SongElement[] | null>(null);
  const [modal, setModal] = useState<{ element: SongElement | null } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    listElements(song.id)
      .then(setElements)
      .catch(() => setElements([]));
  }, [song.id]);

  async function remove(el: SongElement) {
    setDeleting(el.id);
    try {
      await deleteElement(song.id, el.id);
      setElements((prev) => (prev ?? []).filter((e) => e.id !== el.id));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete the element.", "error");
    } finally {
      setDeleting(null);
    }
  }

  function onSaved(el: SongElement) {
    setElements((prev) => {
      const list = prev ?? [];
      return list.some((e) => e.id === el.id)
        ? list.map((e) => (e.id === el.id ? el : e))
        : [...list, el];
    });
  }

  return (
    <div className="mt-4 rounded-[14px] border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shapes className="h-4 w-4 text-pulse" />
          <h3 className="text-[13px] font-medium text-white">Elements</h3>
          <span className="hidden text-[11px] text-white/40 sm:inline">
            · @mention any of these in a scene, then regenerate it
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModal({ element: null })}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/70 transition-colors hover:border-pulse/50 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5 text-pulse" />
          Add element
        </button>
      </div>

      {elements === null ? (
        <div className="flex items-center gap-2 py-3 text-[12px] text-white/40">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : elements.length === 0 ? (
        <p className="py-1 text-[12px] leading-relaxed text-white/45">
          No elements yet. Add a dog, headphones, a prop — anything you want in this video — then
          @mention it by name in a scene and regenerate.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {elements.map((e) => (
            <div
              key={e.id}
              className="group relative overflow-hidden rounded-[12px] border border-white/10 bg-black/40"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-black/40">
                {e.imageUrl ? (
                  <img src={e.imageUrl} alt={e.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Shapes className="h-6 w-6 text-white/25" />
                  </div>
                )}
                <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setModal({ element: e })}
                    aria-label="Edit element"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-pulse hover:text-white"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    disabled={deleting === e.id}
                    onClick={() => void remove(e)}
                    aria-label="Delete element"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-pulse hover:text-white disabled:opacity-60"
                  >
                    {deleting === e.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <div className="px-2.5 py-1.5 text-[12px] font-medium text-white">
                <span className="block truncate">{e.name}</span>
                {!e.imageUrl && <span className="text-[10px] text-amber-300">No image yet</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <ElementEditModal
          songId={song.id}
          element={modal.element}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}
