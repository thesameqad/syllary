import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { lyricsToText, type Song } from "@syllary/shared";
import { ApiError, updateSongLyrics } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";

export function LyricsEditModal({
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
  const initial = song.lyrics ? lyricsToText(song.lyrics) : "";
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setText(song.lyrics ? lyricsToText(song.lyrics) : "");
  }, [open, song.lyrics]);

  const dirty = text !== initial;

  async function save() {
    setSaving(true);
    try {
      const updated = await updateSongLyrics(song.id, text);
      toast("Lyrics saved.");
      onSaved(updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't save lyrics.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Edit lyrics" widthClass="max-w-[680px]">
      <p className="mb-3 text-[13px] leading-relaxed text-white/50">
        Wrap a line in square brackets to mark a section, e.g.{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-white/70">[Verse 1]</code>{" "}
        or{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-white/70">[Chorus]</code>.
        Word timing re-syncs automatically where the words match.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        disabled={saving}
        placeholder="[Verse 1]&#10;Your first line here&#10;Your second line here&#10;&#10;[Chorus]&#10;…"
        className="h-[46vh] min-h-[300px] w-full resize-none rounded-[12px] border border-white/10 bg-black/30 p-4 font-mono text-[14px] leading-[1.7] text-white/90 outline-none transition-colors focus:border-pulse/50 disabled:opacity-60"
      />

      <div className="mt-4 flex items-center justify-end gap-2">
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
          disabled={saving || !dirty}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Saving…" : "Save lyrics"}
        </button>
      </div>
    </Modal>
  );
}
