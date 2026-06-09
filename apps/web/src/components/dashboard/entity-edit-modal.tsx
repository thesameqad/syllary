import { useRef, useState } from "react";
import { Disc3, Image as ImageIcon, Loader2, Sparkles, User } from "lucide-react";
import {
  ApiError,
  generateEntityCover,
  saveEntityCover,
  updateAlbum,
  updateArtist,
  uploadEntityCover,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { CoverCropper } from "@/components/result/cover-cropper";
import { AiCoverPanel, COVER_TOKENS_FROM } from "@/components/result/ai-cover-panel";

export type EntityEditTarget = {
  kind: "artists" | "albums";
  id: string;
  name: string;
  coverUrl: string | null;
  releaseDate?: string | null;
};

/** Edit an artist/album entity: name, cover (upload + square crop), and — for an
 *  album — release date. Covers reuse the song CoverCropper + entity cover API. */
export function EntityEditModal({
  target,
  onClose,
  onSaved,
}: {
  target: EntityEditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isAlbum = target.kind === "albums";
  const [name, setName] = useState(target.name);
  const [releaseDate, setReleaseDate] = useState(target.releaseDate ?? "");
  const [coverUrl, setCoverUrl] = useState(target.coverUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const coverSeed = isAlbum
    ? `Album cover artwork for "${name.trim() || "an album"}"`
    : `Artist profile portrait for "${name.trim() || "a musician"}"`;

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setCropSrc(URL.createObjectURL(f));
  }
  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function applyCrop(blob: Blob) {
    setBusy(true);
    try {
      const url = await uploadEntityCover(target.kind, target.id, blob);
      setCoverUrl(url);
      toast("Cover updated.");
      onSaved();
      closeCrop();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update the cover.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const n = name.trim();
    if (!n) {
      toast("Give it a name.", "error");
      return;
    }
    setBusy(true);
    try {
      if (isAlbum) await updateAlbum(target.id, { name: n, releaseDate: releaseDate.trim() || null });
      else await updateArtist(target.id, { name: n });
      toast("Saved.");
      onSaved();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
    } finally {
      setBusy(false);
    }
  }

  const Fallback = isAlbum ? Disc3 : User;

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={
        cropSrc
          ? "Crop cover image"
          : aiOpen
            ? "Generate cover with AI"
            : isAlbum
              ? "Edit album"
              : "Edit artist"
      }
      widthClass="max-w-[480px]"
    >
      {cropSrc ? (
        <CoverCropper src={cropSrc} busy={busy} onApply={applyCrop} onCancel={closeCrop} />
      ) : aiOpen ? (
        <AiCoverPanel
          defaultPrompt={coverSeed}
          onGenerate={(prompt, model) => generateEntityCover(target.kind, target.id, prompt, model)}
          onCommit={async (key) => {
            const url = await saveEntityCover(target.kind, target.id, key);
            setCoverUrl(url);
            onSaved();
            setAiOpen(false);
          }}
          onCancel={() => setAiOpen(false)}
        />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-white/10 bg-black/40">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-white/30">
                  <Fallback className="h-6 w-6" />
                </div>
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-60"
                >
                  <ImageIcon className="h-3.5 w-3.5 text-pulse" />
                  {coverUrl ? "Replace image" : "Add image"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAiOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[12px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5 text-pulse" />
                  Generate with AI
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-white/40">
                Upload a square image (you'll crop it), or generate one with AI (from{" "}
                {COVER_TOKENS_FROM} tokens).
              </p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
              {isAlbum ? "Album name" : "Artist name"}
            </span>
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60"
            />
          </label>

          {isAlbum && (
            <label className="mt-2.5 flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Release date</span>
              <input
                type="date"
                value={releaseDate}
                disabled={busy}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60 [color-scheme:dark]"
              />
            </label>
          )}

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
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
