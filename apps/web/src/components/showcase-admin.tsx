import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { ShowcaseTagAdmin } from "@syllary/shared";
import {
  adminCreateShowcaseTag,
  adminDeleteShowcaseTag,
  adminGetSongShowcaseTags,
  adminListShowcaseTags,
  adminSetSongShowcaseTags,
  ApiError,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Admin-only "Showcase" pill on public pages: assign this song's public video
 *  to the hand-curated dashboard categories (and manage the tags inline). The
 *  component probes an admin endpoint on mount and renders NOTHING for
 *  non-admins (the API enforces the allowlist on every call regardless). */
export function ShowcaseAdmin({ songId, signedIn }: { songId: string; signedIn: boolean }) {
  const toast = useToast();
  const [assigned, setAssigned] = useState<Set<string> | null>(null);
  const [tags, setTags] = useState<ShowcaseTagAdmin[] | null>(null);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!signedIn) return;
    adminGetSongShowcaseTags(songId)
      .then((ids) => setAssigned(new Set(ids)))
      .catch(() => setAssigned(null)); // 403 = not an admin → stay hidden
  }, [songId, signedIn]);

  useEffect(() => {
    if (!open) return;
    adminListShowcaseTags()
      .then(setTags)
      .catch(() => setTags([]));
  }, [open]);

  if (!signedIn || assigned === null) return null;

  function toggle(tagId: string) {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }

  async function createTag() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const tag = await adminCreateShowcaseTag(name);
      setTags((prev) => [...(prev ?? []), { ...tag, itemCount: 0 }]);
      setNewName("");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't create the tag.", "error");
    } finally {
      setCreating(false);
    }
  }

  async function deleteTag(tagId: string) {
    try {
      await adminDeleteShowcaseTag(tagId);
      setTags((prev) => (prev ?? []).filter((t) => t.id !== tagId));
      setAssigned((prev) => {
        const next = new Set(prev);
        next.delete(tagId);
        return next;
      });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't delete the tag.", "error");
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await adminSetSongShowcaseTags(songId, [...(assigned ?? [])]);
      toast("Showcase updated.", "success");
      setOpen(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
          assigned.size > 0
            ? "border-pulse/50 bg-pulse/15 text-white"
            : "border-white/15 text-white/60 hover:border-white/35 hover:text-white",
        )}
        title="Admin: feature this video on the dashboard showcase."
      >
        <Sparkles className="h-3 w-3" />
        Showcase{assigned.size > 0 ? ` · ${assigned.size}` : ""}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-[16px] border border-white/10 bg-[#141414] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-medium text-white">Showcase this video</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/40 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-[12px] text-white/45">
              Pick the dashboard categories where this public video should appear.
            </p>

            <div className="mt-4 max-h-64 space-y-1.5 overflow-y-auto">
              {tags === null ? (
                <p className="text-[12px] text-white/35">Loading…</p>
              ) : tags.length === 0 ? (
                <p className="text-[12px] text-white/35">No tags yet — create the first one below.</p>
              ) : (
                tags.map((tag) => (
                  <div key={tag.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(tag.id)}
                      className={cn(
                        "flex flex-1 items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-[13px] transition-colors",
                        assigned.has(tag.id)
                          ? "border-pulse/50 bg-pulse/10 text-white"
                          : "border-white/10 text-white/70 hover:border-white/25 hover:text-white",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                          assigned.has(tag.id)
                            ? "border-pulse bg-pulse text-white"
                            : "border-white/25 bg-transparent",
                        )}
                      >
                        {assigned.has(tag.id) && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">
                        {tag.name}
                        <span className="ml-2 text-[11px] text-white/35">{tag.itemCount}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteTag(tag.id)}
                      title="Delete this tag everywhere."
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10 text-white/35 transition-colors hover:border-pulse/50 hover:text-pulse"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void createTag()}
                placeholder="New tag (e.g. Abstract)"
                className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:border-white/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void createTag()}
                disabled={creating || !newName.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/15 text-white/70 transition-colors hover:border-white/35 hover:text-white disabled:opacity-40"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-pulse py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
