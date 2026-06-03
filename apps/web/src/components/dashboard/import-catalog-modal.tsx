import { useState } from "react";
import { DownloadCloud, Loader2 } from "lucide-react";
import { ApiError, importCatalog } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";

/** Import an artist/album catalog (metadata only) from a Deezer link. */
export function ImportCatalogModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!url.trim()) {
      toast("Paste a Deezer artist or album link.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await importCatalog(url.trim());
      toast(
        `Imported ${res.artistName ?? "catalog"} — ${res.albumsImported} album${
          res.albumsImported === 1 ? "" : "s"
        }, ${res.tracks} tracks.`,
      );
      onImported();
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't import that.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Import from Deezer" widthClass="max-w-[480px]">
      <p className="text-[13px] leading-relaxed text-white/55">
        Paste a Deezer <span className="text-white/80">artist</span> or{" "}
        <span className="text-white/80">album</span> link. We'll create the artists, albums, covers,
        and release dates — then you upload your own audio for each track to generate the lyrics.
      </p>
      <input
        value={url}
        disabled={busy}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void run();
        }}
        placeholder="https://www.deezer.com/en/artist/…"
        className="mt-3 w-full rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60"
      />
      <p className="mt-1.5 text-[11px] text-white/40">
        Deezer only — free, no account needed. Audio and lyrics aren't imported.
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
          onClick={() => void run()}
          className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
          {busy ? "Importing…" : "Import"}
        </button>
      </div>
    </Modal>
  );
}
