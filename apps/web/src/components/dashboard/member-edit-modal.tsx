import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Plus, X } from "lucide-react";
import { type BandMember, MEMBER_IMAGE_MAX } from "@syllary/shared";
import {
  ApiError,
  createMember,
  removeMemberImage,
  updateMember,
  uploadMemberImage,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { CoverCropper } from "@/components/result/cover-cropper";

const FIELD =
  "w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60";

/** Create or edit a cast member: name, which artist it belongs to, and a gallery
 *  of reference photos (portrait crop). Photos can only be added once the cast
 *  member exists, so creating first persists it, then the gallery unlocks. */
export function MemberEditModal({
  member: initial,
  artists,
  onClose,
  onSaved,
}: {
  member: BandMember | null;
  artists: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [member, setMember] = useState<BandMember | null>(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [artistId, setArtistId] = useState(initial?.artistId ?? artists[0]?.id ?? "");
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const images = member?.images ?? [];
  const atMax = images.length >= MEMBER_IMAGE_MAX;

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
    if (!member) return;
    setBusy(true);
    try {
      const updated = await uploadMemberImage(member.id, blob);
      setMember(updated);
      onSaved();
      closeCrop();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't add the photo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(key: string) {
    if (!member) return;
    setBusy(true);
    try {
      const updated = await removeMemberImage(member.id, key);
      setMember(updated);
      onSaved();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't remove the photo.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const n = name.trim();
    if (!n) return toast("Give the cast member a name.", "error");
    if (!artistId) return toast("Pick an artist.", "error");
    setBusy(true);
    try {
      if (member) {
        const updated = await updateMember(member.id, { name: n, artistId });
        setMember(updated);
        onSaved();
        toast("Saved.");
        onClose();
      } else {
        // Create first, then unlock the photo gallery (uploads need the member id).
        const created = await createMember({ name: n, artistId });
        setMember(created);
        onSaved();
        toast("Cast member created — now add some photos.");
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save the cast member.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={cropSrc ? "Crop photo" : member ? "Edit cast member" : "New cast member"}
      widthClass="max-w-[520px]"
    >
      {cropSrc ? (
        <CoverCropper
          src={cropSrc}
          busy={busy}
          aspect={3 / 4}
          caption="Drag to reposition · slide to zoom. Saved as a portrait reference."
          onApply={applyCrop}
          onCancel={closeCrop}
        />
      ) : artists.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-white/60">
          You&apos;ll need an artist first — upload a song or import from Deezer to create one, then
          come back here to add cast members.
        </p>
      ) : (
        <>
          <p className="mb-3 text-[12px] leading-relaxed text-white/50">
            A cast member is a person — real or AI-generated — the AI can paint into your
            lyric-video scenes. Add a few reference photos so it captures their likeness, then pick
            them when you generate a video.
          </p>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
              Name <span className="text-pulse">*</span>
            </span>
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              className={FIELD}
              placeholder="e.g. you, the lead singer, or a guest"
            />
          </label>

          <label className="mt-2.5 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
              Artist <span className="text-pulse">*</span>
            </span>
            <select
              value={artistId}
              disabled={busy}
              onChange={(e) => setArtistId(e.target.value)}
              className={`${FIELD} [color-scheme:dark]`}
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {/* Photo gallery — only once the member exists (uploads need its id). */}
          <div className="mt-4">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
              Reference photos
              <span className="ml-1.5 font-normal normal-case tracking-normal text-white/30">
                · up to {MEMBER_IMAGE_MAX} per cast member
              </span>
            </span>
            {member ? (
              <div className="mt-2 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {images.map((img) => (
                  <div
                    key={img.key}
                    className="group relative aspect-[3/4] overflow-hidden rounded-[10px] border border-white/10 bg-black/40"
                  >
                    <img src={img.url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeImage(img.key)}
                      aria-label="Remove photo"
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 opacity-0 transition-opacity hover:bg-pulse hover:text-white group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {!atMax && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-white/15 text-white/50 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-60"
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                    <span className="text-[11px]">Add photo</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
                <ImageIcon className="h-3.5 w-3.5" />
                Save the cast member first, then add up to {MEMBER_IMAGE_MAX} photos of them.
              </p>
            )}
            {member && (
              <p className="mt-1.5 text-[11px] text-white/40">
                {images.length}/{MEMBER_IMAGE_MAX} photos for this cast member. A few clear shots
                from different angles give the best likeness.
              </p>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
            >
              {member ? "Done" : "Cancel"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {member ? "Save" : "Create"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
