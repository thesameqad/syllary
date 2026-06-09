import { useEffect, useRef, useState } from "react";
import { ExternalLink, Image as ImageIcon, Loader2, Plus, Sparkles, Wand2, X } from "lucide-react";
import type { MetaSuggestions, Song, SongLink } from "@syllary/shared";
import {
  ApiError,
  generateCover,
  getMetaSuggestions,
  matchLinks,
  saveGeneratedCover,
  updateSong,
  uploadCover,
} from "@/lib/api";
import { GENRES } from "@/lib/genres";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { CoverCropper } from "@/components/result/cover-cropper";
import { AiCoverPanel, COVER_TOKENS_FROM } from "@/components/result/ai-cover-panel";
import { KNOWN_PLATFORMS, platformKey, platformMeta } from "@/lib/platforms";
import { cn } from "@/lib/utils";

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
  for (const l of links) {
    if (!KNOWN_PLATFORMS.some((p) => p.key === l.platform)) {
      rows.push({ key: l.platform, label: platformMeta(l.platform).label, url: l.url, custom: true });
    }
  }
  return rows;
}

/** Text input with a filtered suggestion dropdown (artist/album autosuggest). */
function AutoField({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const v = value.trim().toLowerCase();
  const matches = suggestions
    .filter((s) => s.toLowerCase().includes(v) && s.toLowerCase() !== v)
    .slice(0, 6);
  return (
    <label className="relative flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">{label}</span>
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className={FIELD}
        placeholder={placeholder}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-[10px] border border-white/10 bg-stage/95 py-1 shadow-[0_12px_30px_-10px_rgba(0,0,0,0.7)] backdrop-blur">
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
              className="block w-full truncate px-3 py-1.5 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </label>
  );
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
  const [title, setTitle] = useState(song.title ?? "");
  const [artist, setArtist] = useState(song.artist ?? "");
  const [album, setAlbum] = useState(song.album ?? "");
  const [year, setYear] = useState(song.year ? String(song.year) : "");
  const [genre, setGenre] = useState(song.genre ?? "");
  const [rows, setRows] = useState<LinkRow[]>(() => initialRows(song.links));
  const [saving, setSaving] = useState(false);
  const [isPublic, setIsPublic] = useState(song.isPublic);
  const [publishing, setPublishing] = useState(false);
  const [suggestions, setSuggestions] = useState<MetaSuggestions>({ artists: [], albums: [] });
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [matching, setMatching] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findTitle, setFindTitle] = useState("");
  const [findArtist, setFindArtist] = useState("");
  const [findUrl, setFindUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset only when the modal (re)opens — so a cover/public change mid-edit
  // doesn't wipe in-progress metadata edits.
  useEffect(() => {
    if (!open) return;
    setTitle(song.title ?? "");
    setArtist(song.artist ?? "");
    setAlbum(song.album ?? "");
    setYear(song.year ? String(song.year) : "");
    setGenre(song.genre ?? "");
    setRows(initialRows(song.links));
    setIsPublic(song.isPublic);
    setCropSrc(null);
    setAiOpen(false);
    setFindOpen(false);
    setFindUrl("");
    getMetaSuggestions()
      .then(setSuggestions)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function setRow(i: number, patch: Partial<LinkRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Merge auto-matched links into the rows: fill the matching known-platform
  // row, or append a custom row for platforms we don't list (Deezer, etc.).
  function applyMatches(matched: SongLink[]) {
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      for (const link of matched) {
        const existing = next.find(
          (r) => r.key === link.platform || platformKey(r.label) === link.platform,
        );
        if (existing) existing.url = link.url;
        else
          next.push({
            key: link.platform,
            label: platformMeta(link.platform).label,
            url: link.url,
            custom: !KNOWN_PLATFORMS.some((p) => p.key === link.platform),
          });
      }
      return next;
    });
  }

  // Toggle the find panel, prefilling its search fields from the song's current
  // name/artist (so the common case is a single click → Search).
  function toggleFind() {
    setFindOpen((open) => {
      if (!open) {
        setFindTitle(title.trim());
        setFindArtist(artist.trim());
      }
      return !open;
    });
  }

  async function findLinks() {
    const hasUrl = findUrl.trim().length > 0;
    if (!hasUrl && !findTitle.trim() && !findArtist.trim()) {
      toast("Enter a song name & artist, or paste a streaming link.", "error");
      return;
    }
    setMatching(true);
    try {
      const res = await matchLinks({
        title: findTitle,
        artist: findArtist,
        url: findUrl,
      });
      applyMatches(res.links);
      if (res.links.length > 0) {
        toast(`Found ${res.links.length} link${res.links.length > 1 ? "s" : ""}.`);
        setFindOpen(false);
      } else {
        toast("No matches found — try a paste-link, or add them manually.");
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't look up links.", "error");
    } finally {
      setMatching(false);
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!f) return;
    setCropSrc(URL.createObjectURL(f));
  }

  async function applyCrop(blob: Blob) {
    setCoverBusy(true);
    try {
      const updated = await uploadCover(song.id, blob);
      onSaved(updated);
      toast("Cover updated.");
      closeCrop();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update the cover.", "error");
    } finally {
      setCoverBusy(false);
    }
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function togglePublic() {
    setPublishing(true);
    try {
      const updated = await updateSong(song.id, { isPublic: !isPublic });
      setIsPublic(updated.isPublic);
      onSaved(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't update visibility.", "error");
    } finally {
      setPublishing(false);
    }
  }

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast("Give the song a name.", "error");
      return;
    }

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
        title: trimmedTitle,
        artist: artist.trim() || null,
        album: album.trim() || null,
        year: parsedYear,
        genre: genre.trim() || null,
        links,
      });
      toast("Public details saved.");
      onSaved(updated);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save details.", "error");
    } finally {
      setSaving(false);
    }
  }

  const busy = saving || coverBusy || publishing;
  const coverSeed = [
    title.trim() ? `Album cover for "${title.trim()}"` : "Album cover artwork",
    artist.trim() ? `by ${artist.trim()}` : "",
    genre.trim() ? `, ${genre.trim()} mood` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={
        cropSrc ? "Crop cover image" : aiOpen ? "Generate cover with AI" : "Edit public details"
      }
      widthClass="max-w-[620px]"
    >
      {cropSrc ? (
        <CoverCropper src={cropSrc} busy={coverBusy} onApply={applyCrop} onCancel={closeCrop} />
      ) : aiOpen ? (
        <AiCoverPanel
          defaultPrompt={coverSeed}
          onGenerate={(prompt, model) => generateCover(song.id, prompt, model)}
          onCommit={async (key) => {
            const updated = await saveGeneratedCover(song.id, key);
            onSaved(updated);
            setAiOpen(false);
          }}
          onCancel={() => setAiOpen(false)}
        />
      ) : (
        <>
          <div className="max-h-[68vh] overflow-y-auto pr-1">
            {/* Public toggle */}
            <div className="mb-4 flex items-center justify-between rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-4 py-3">
              <div>
                <div className="text-[13px] font-medium text-white">Public page</div>
                <div className="mt-0.5 text-[11px] text-white/45">
                  {isPublic ? (
                    <a
                      href={`/p/${song.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-pulse hover:underline"
                    >
                      Live at /p/{song.id.slice(0, 8)} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    "Only you can see this song."
                  )}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isPublic}
                disabled={busy}
                onClick={() => void togglePublic()}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60",
                  isPublic ? "bg-pulse" : "bg-white/15",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                    isPublic ? "translate-x-5" : "translate-x-0",
                  )}
                />
              </button>
            </div>

            {/* Cover image */}
            <div className="mb-5">
              <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Cover image</span>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[10px] border border-white/10 bg-black/40">
                  {song.coverUrl ? (
                    <img src={song.coverUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-white/30">
                      <ImageIcon className="h-6 w-6" />
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
                      {song.coverUrl ? "Replace image" : "Add image"}
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
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickFile}
                  className="hidden"
                />
              </div>
            </div>

            <label className="mb-2.5 flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Song name</span>
              <input
                value={title}
                disabled={saving}
                onChange={(e) => setTitle(e.target.value)}
                className={FIELD}
                placeholder="Song title"
              />
            </label>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <AutoField
                label="Artist"
                value={artist}
                onChange={setArtist}
                suggestions={suggestions.artists}
                placeholder="Artist name"
                disabled={saving}
              />
              <AutoField
                label="Album"
                value={album}
                onChange={setAlbum}
                suggestions={suggestions.albums}
                placeholder="Album name"
                disabled={saving}
              />
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
              <AutoField
                label="Genre"
                value={genre}
                onChange={setGenre}
                suggestions={GENRES}
                placeholder="e.g. Indie folk"
                disabled={saving}
              />
            </div>

            <div className="mt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[12px] font-medium text-white">Listen on</h3>
                  <p className="mb-3 mt-0.5 text-[12px] text-white/45">
                    Paste each platform URL — or auto-fill them all at once.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={toggleFind}
                  title="Auto-find this track's links across platforms"
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors disabled:opacity-60",
                    findOpen
                      ? "border-pulse/60 bg-pulse/[0.12] text-white"
                      : "border-white/10 bg-white/[0.04] text-white/80 hover:border-pulse/50 hover:text-white",
                  )}
                >
                  <Wand2 className="h-3.5 w-3.5 text-pulse" />
                  Find links
                </button>
              </div>

              {findOpen && (
                <div className="mb-3 rounded-[12px] border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="mb-2.5 text-[12px] text-white/55">
                    Find this track everywhere — search by name &amp; artist, or paste any one
                    streaming link (Spotify, Apple Music, YouTube…) and we'll fetch the rest.
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={findTitle}
                      disabled={matching}
                      onChange={(e) => setFindTitle(e.target.value)}
                      className={FIELD}
                      placeholder="Song name"
                    />
                    <input
                      value={findArtist}
                      disabled={matching}
                      onChange={(e) => setFindArtist(e.target.value)}
                      className={FIELD}
                      placeholder="Artist"
                    />
                  </div>
                  <div className="my-2 flex items-center gap-2 text-[11px] uppercase tracking-[1px] text-white/30">
                    <span className="h-px flex-1 bg-white/10" />
                    or
                    <span className="h-px flex-1 bg-white/10" />
                  </div>
                  <input
                    value={findUrl}
                    disabled={matching}
                    onChange={(e) => setFindUrl(e.target.value)}
                    className={FIELD}
                    placeholder="Paste a Spotify / Apple Music / YouTube link"
                  />
                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={matching}
                      onClick={() => setFindOpen(false)}
                      className="rounded-full px-4 py-1.5 text-[12px] text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={matching}
                      onClick={() => void findLinks()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-pulse px-4 py-1.5 text-[12px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
                    >
                      {matching ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      {matching ? "Searching…" : "Search"}
                    </button>
                  </div>
                </div>
              )}

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
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Saving…" : "Save details"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
