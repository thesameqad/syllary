import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  Copy,
  Globe,
  Loader2,
  MoreVertical,
  Music,
  Pencil,
  Share2,
  SquarePen,
  Trash2,
  X,
} from "lucide-react";
import type { SongSummary } from "@syllary/shared";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { ProcessingOverlay } from "@/components/dashboard/processing-overlay";
import { cn } from "@/lib/utils";

export type SongCardManage = {
  onRename: (title: string) => Promise<void>;
  onTogglePublic: () => Promise<void>;
  onDelete: () => Promise<void>;
};

function fmtDuration(s: number | null): string {
  if (s == null) return "";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

function statusText(song: SongSummary): string {
  if (song.status === "ready") return `${song.lineCount} lines`;
  if (song.status === "failed") return "Failed";
  if (song.stage === "separating") return "Isolating vocals…";
  if (song.stage === "transcribing") return "Transcribing…";
  return "Queued…";
}

const MENU_ITEM =
  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-white/80 transition-colors hover:bg-white/[0.06]";

export function SongCard({ song, manage }: { song: SongSummary; manage?: SongCardManage }) {
  const ready = song.status === "ready";
  const navigate = useNavigate();
  const toast = useToast();

  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(song.title);
  const [savingRename, setSavingRename] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const shareUrl = `${window.location.origin}/p/${song.id}`;

  function startRename() {
    setMenuOpen(false);
    setDraft(song.title);
    setRenaming(true);
  }

  async function submitRename() {
    if (!manage) return;
    const name = draft.trim();
    if (!name || name === song.title) {
      setRenaming(false);
      return;
    }
    setSavingRename(true);
    try {
      await manage.onRename(name);
      toast("Song renamed.");
      setRenaming(false);
    } catch {
      toast("Couldn't rename the song.", "error");
      setDraft(song.title);
      setRenaming(false);
    } finally {
      setSavingRename(false);
    }
  }

  async function togglePublic() {
    if (!manage) return;
    setMenuOpen(false);
    const next = !song.isPublic;
    try {
      await manage.onTogglePublic();
      toast(next ? "Song is now public." : "Song is now private.");
    } catch {
      toast("Couldn't update visibility.", "error");
    }
  }

  async function confirmDelete() {
    if (!manage) return;
    setDeleting(true);
    try {
      await manage.onDelete();
      toast("Song deleted.");
      // Card unmounts when the parent reloads its list.
    } catch {
      toast("Couldn't delete the song.", "error");
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Couldn't copy the link.", "error");
    }
  }

  const cover = (
    <div className="relative aspect-square w-full overflow-hidden bg-[linear-gradient(135deg,#2a0a0a,#0a0303)]">
      {song.coverUrl ? (
        <img src={song.coverUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Music className="h-10 w-10 text-pulse/40" />
        </div>
      )}
      {!ready && song.status !== "failed" && (
        <ProcessingOverlay
          startedAt={song.processingStartedAt ?? song.createdAt}
          stage={song.stage}
        />
      )}
      {song.status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-3 text-center backdrop-blur-[1px]">
          <AlertCircle className="h-6 w-6 text-pulse" />
          <span className="text-[12px] font-medium text-white">Generation failed</span>
          <span className="text-[11px] leading-snug text-white/55">
            Open the track to retry with another mode.
          </span>
        </div>
      )}
      {song.isPublic && (
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white/80 backdrop-blur">
          <Globe className="h-3 w-3" /> Public
        </span>
      )}
    </div>
  );

  const titleBlock = renaming ? (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={draft}
        disabled={savingRename}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submitRename();
          if (e.key === "Escape") {
            setDraft(song.title);
            setRenaming(false);
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[13px] font-medium text-white outline-none focus:border-pulse/60"
      />
      <button
        type="button"
        onClick={() => void submitRename()}
        disabled={savingRename}
        aria-label="Save name"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-pulse text-white transition-transform hover:scale-105 disabled:opacity-60"
      >
        {savingRename ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => {
          setDraft(song.title);
          setRenaming(false);
        }}
        disabled={savingRename}
        aria-label="Discard"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white/60 transition-colors hover:bg-white/[0.12] hover:text-white disabled:opacity-60"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : ready || song.status === "failed" ? (
    <Link to={`/s/${song.id}`} className="block truncate text-[13px] font-medium text-white hover:underline">
      {song.title}
    </Link>
  ) : (
    <div className="truncate text-[13px] font-medium text-white">{song.title}</div>
  );

  // Failed songs are clickable too so the user can open the result page and
  // retry via the regenerate banner.
  const navigable = ready || song.status === "failed";
  return (
    <div className="relative">
      <div className="overflow-hidden rounded-[14px] border border-white/[0.07] bg-stage/50 transition-colors hover:border-white/15">
        {navigable ? (
          <Link to={`/s/${song.id}`} className="block">
            {cover}
          </Link>
        ) : (
          <div>{cover}</div>
        )}
        <div className="p-3">
          {titleBlock}
          <div className="mt-0.5 text-[11px] text-white/40">
            {statusText(song)}
            {song.durationSeconds ? ` · ${fmtDuration(song.durationSeconds)}` : ""}
          </div>
        </div>
      </div>

      {manage && (
        <>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Song actions"
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
                  <button type="button" className={MENU_ITEM} onClick={startRename}>
                    <Pencil className="h-3.5 w-3.5 text-white/55" />
                    Rename
                  </button>
                  <button type="button" className={MENU_ITEM} onClick={() => void togglePublic()}>
                    <Globe className="h-3.5 w-3.5 text-white/55" />
                    <span className="flex-1">Public</span>
                    <span
                      className={cn(
                        "relative h-4 w-7 rounded-full transition-colors",
                        song.isPublic ? "bg-pulse" : "bg-white/15",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all",
                          song.isPublic ? "left-[14px]" : "left-0.5",
                        )}
                      />
                    </span>
                  </button>
                  <button
                    type="button"
                    className={cn(MENU_ITEM, !ready && "cursor-not-allowed opacity-40")}
                    disabled={!ready}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate(`/s/${song.id}?edit=1`);
                    }}
                  >
                    <SquarePen className="h-3.5 w-3.5 text-white/55" />
                    Edit lyrics
                  </button>
                  <button
                    type="button"
                    className={cn(MENU_ITEM, !song.isPublic && "cursor-not-allowed opacity-40")}
                    disabled={!song.isPublic}
                    title={song.isPublic ? undefined : "Make the song public to share it"}
                    onClick={() => {
                      setMenuOpen(false);
                      setShareOpen(true);
                    }}
                  >
                    <Share2 className="h-3.5 w-3.5 text-white/55" />
                    Share with…
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

          <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this track">
            <p className="mb-3 text-[13px] text-white/50">
              Anyone with this link can view the synced lyrics.
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-[10px] border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/80 outline-none"
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] bg-pulse px-3 py-2 text-[12px] font-medium text-white transition-transform hover:scale-[1.03]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </Modal>

          <Modal open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete track">
            <p className="text-[13px] leading-relaxed text-white/60">
              Delete <span className="font-medium text-white">{song.title}</span>? This permanently
              removes the lyrics and the original audio file. This can&apos;t be undone.
            </p>
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
      )}
    </div>
  );
}
