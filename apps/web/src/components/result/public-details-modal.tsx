import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { Song, SongLink } from "@syllary/shared";
import { ApiError, updateSong } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { KNOWN_PLATFORMS, platformKey, platformMeta } from "@/lib/platforms";

const FIELD =
  "w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60";

type LinkRow = { key: string; label: string; url: string; custom: boolean };

function initialRows(links: SongLink[]): LinkRow[] {
  const byKey = new Map(links.map((l) => [l.platform, l.url]));
  const rows: LinkRow[] = KNOWN_PLATFORMS.map((p) => ({
    key: p.key,
    label: p.label,
    url: byKey.get(p.key) ?? "",
    custom: false,
  }));
  // Any saved links that aren't a known platform become custom rows.
  for (const l of links) {
    if (!KNOWN_PLATFORMS.some((p) => p.key === l.platform)) {
      rows.push({ key: l.platform, label: platformMeta(l.platform).label, url: l.url, custom: true });
    }
  }
  return rows;
}

export function PublicDetailsModal({
  open,
  song,
  onClose,
  onSaved,
}: {
  open: boolean;
  song: Song;
  onClose: () => void;
  onSaved: (song: Song) => void;
}) {
  const toast = useToast();
  const [artist, setArtist] = useState(song.artist ?? "");
  const [album, setAlbum] = useState(song.album ?? "");
  const [year, setYear] = useState(song.year ? String(song.year) : "");
  const [genre, setGenre] = useState(song.genre ?? "");
  const [rows, setRows] = useState<LinkRow[]>(() => initialRows(song.links));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setArtist(song.artist ?? "");
    setAlbum(song.album ?? "");
    setYear(song.year ? String(song.year) : "");
    setGenre(song.genre ?? "");
    setRows(initialRows(song.links));
  }, [open, song]);

  function setRow(i: number, patch: Partial<LinkRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function save() {
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    if (parsedYear !== null && (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 9999)) {
      toast("Enter a valid year.", "error");
      return;
    }

    const links: SongLink[] = [];
    for (const r of rows) {
      const url = r.url.trim();
      if (!url) continue;
      try {
        // Basic validation; backend enforces a proper URL too.
        new URL(url);
      } catch {
        toast(`“${r.label || "Link"}” isn't a valid URL.`, "error");
        return;
      }
      const key = r.custom ? platformKey(r.label) : r.key;
      if (!key) {
        toast("Give each custom platform a name.", "error");
        return;
      }
      links.push({ platform: key, url });
    }

    setSaving(true);
    try {
      const updated = await updateSong(song.id, {
        artist: artist.trim() || null,
        album: album.trim() || null,
        year: parsedYear,
        genre: genre.trim() || null,
        links,
      });
      toast("Public details saved.");
      onSaved(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save details.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      title="Edit public details"
      widthClass="max-w-[620px]"
    >
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Artist</span>
            <input value={artist} disabled={saving} onChange={(e) => setArtist(e.target.value)} className={FIELD} placeholder="Artist name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Album</span>
            <input value={album} disabled={saving} onChange={(e) => setAlbum(e.target.value)} className={FIELD} placeholder="Album name" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Year</span>
            <input
              value={year}
              disabled={saving}
              inputMode="numeric"
              onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              className={FIELD}
              placeholder="2024"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Genre</span>
            <input value={genre} disabled={saving} onChange={(e) => setGenre(e.target.value)} className={FIELD} placeholder="e.g. Indie folk" />
          </label>
        </div>

        <div className="mt-5">
          <h3 className="text-[12px] font-medium text-white">Listen on</h3>
          <p className="mb-3 mt-0.5 text-[12px] text-white/45">
            Paste the URL where listeners can find this song on each platform. Leave blank to hide.
          </p>

          <div className="flex flex-col gap-2">
            {rows.map((row, i) => {
              const meta = platformMeta(row.key || platformKey(row.label));
              return (
                <div key={i} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: meta.color }}
                    aria-hidden
                  />
                  {row.custom ? (
                    <input
                      value={row.label}
                      disabled={saving}
                      onChange={(e) => setRow(i, { label: e.target.value })}
                      placeholder="Platform"
                      className={`${FIELD} max-w-[140px]`}
                    />
                  ) : (
                    <span className="w-[110px] shrink-0 text-[13px] text-white/70">{row.label}</span>
                  )}
                  <input
                    value={row.url}
                    disabled={saving}
                    onChange={(e) => setRow(i, { url: e.target.value })}
                    placeholder={meta.placeholder || "https://..."}
                    className={`${FIELD} min-w-0 flex-1`}
                  />
                  {row.url ? (
                    <button
                      type="button"
                      onClick={() => setRow(i, { url: "" })}
                      aria-label="Clear"
                      className="shrink-0 rounded-md p-1 text-white/40 transition-colors hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-6 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => setRows((prev) => [...prev, { key: "", label: "", url: "", custom: true }])}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-white/15 py-2.5 text-[13px] text-white/60 transition-colors hover:border-white/30 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add another platform
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
        <button
          type="button"
          disabled={saving}
          onClick={onClose}
          className="rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save details"}
        </button>
      </div>
    </Modal>
  );
}
