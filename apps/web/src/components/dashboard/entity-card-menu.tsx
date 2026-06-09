import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";

export type EntityCardManage = {
  onEdit: () => void;
  onDelete: () => Promise<void>;
};

const MENU_ITEM =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/[0.06]";

/** A 3-dots actions menu (Edit / Delete) for an album or artist card — mirrors
 *  the song card's menu, with a destructive-delete confirmation. The card itself
 *  must be positioned `relative` for the absolute button to anchor correctly. */
export function EntityCardMenu({
  label,
  onEdit,
  onDelete,
  deleteTitle,
  deleteWarning,
}: EntityCardManage & {
  label: string;
  deleteTitle: string;
  deleteWarning: ReactNode;
}) {
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await onDelete();
      toast("Deleted.");
      // Card unmounts when the parent reloads its list.
    } catch {
      toast("Couldn't delete that.", "error");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={label}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-md bg-black/55 text-white/80 backdrop-blur transition-colors hover:bg-black/75 hover:text-white"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="absolute right-2 top-11 z-30 w-44 overflow-hidden rounded-[12px] border border-white/[0.08] bg-stage shadow-[0_20px_40px_rgba(0,0,0,0.55)]"
            >
              <button
                type="button"
                className={MENU_ITEM}
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
              >
                <Pencil className="h-3.5 w-3.5 text-white/55" />
                Edit
              </button>
              <div className="my-1 h-px bg-white/[0.06]" />
              <button
                type="button"
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-pulse transition-colors hover:bg-pulse/10"
                onClick={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title={deleteTitle}>
        <p className="text-[13px] leading-relaxed text-white/60">{deleteWarning}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setDeleteOpen(false)}
            className="rounded-[10px] px-4 py-2 text-[13px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void confirmDelete()}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Delete
          </button>
        </div>
      </Modal>
    </>
  );
}
