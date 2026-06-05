import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { parse } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { useObjectUrl } from "@/hooks/use-object-url";
import { LyricsPlayer } from "@/components/result/lyrics-player";
import { ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

const SAMPLE = "[ti:My Song]\n[00:01.00]First line\n[00:04.50]Second line\n[00:08.00]Third line\n";

/** Online .lrc editor: edit the raw file on the left, see a live karaoke preview
 *  on the right, drop in your own audio to play along, and download when done.
 *  Fully client-side. */
export function LrcEditor() {
  const [text, setText] = useState(SAMPLE);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const audioUrl = useObjectUrl(audioFile);

  const parsed = useMemo<{ lyrics: Lyrics | null; error: string | null }>(() => {
    if (!text.trim()) return { lyrics: null, error: null };
    try {
      return { lyrics: parse("lrc", text), error: null };
    } catch (err) {
      return { lyrics: null, error: err instanceof Error ? err.message : "Invalid .lrc" };
    }
  }, [text]);

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Audio files play; text-like files load into the editor.
    if (file.type.startsWith("audio/")) {
      setAudioFile(file);
    } else {
      void file.text().then(setText);
    }
  }

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ToolCard>
          <div className="mb-3 flex items-center justify-between gap-2">
            <ToolLabel>Your .lrc</ToolLabel>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.05]">
              <Upload className="h-3.5 w-3.5" />
              Open file
              <input type="file" accept=".lrc,audio/*" className="hidden" onChange={onUpload} />
            </label>
          </div>
          <ToolTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="min-h-[340px]"
          />
          {parsed.error && <p className="mt-3 text-[13px] text-pulse">{parsed.error}</p>}
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-[12px] text-white/55 hover:text-white/80">
            <Upload className="h-3.5 w-3.5" />
            {audioFile ? `Audio: ${audioFile.name}` : "Add audio to play along (optional)"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </ToolCard>

        <div>
          {parsed.lyrics && parsed.lyrics.lines.length > 0 ? (
            <LyricsPlayer
              audioUrl={audioUrl}
              lyrics={parsed.lyrics}
              title="Live preview"
              meta={`${parsed.lyrics.lines.length} lines`}
              baseName="lyrics"
              showDownloads
              lyricsAlign="left"
            />
          ) : (
            <ToolCard className="flex min-h-[340px] items-center justify-center text-center text-[13px] text-white/40">
              Your live karaoke preview appears here as you edit.
            </ToolCard>
          )}
        </div>
      </div>

      <ToolFunnelCta />
    </div>
  );
}
