import { useState } from "react";
import { Music, Upload } from "lucide-react";
import { detectFormat, parse } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { useObjectUrl } from "@/hooks/use-object-url";
import { LyricsPlayer } from "@/components/result/lyrics-player";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

/** Paste synced lyrics + drop your own audio → a karaoke-style preview player
 *  with word-by-word highlighting and every-format downloads. 100% in-browser
 *  (your audio never leaves your device). */
export function LyricsPreviewPlayer() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioUrl = useObjectUrl(audioFile);

  function load() {
    setError(null);
    if (!text.trim()) {
      setError("Paste your synced lyrics (e.g. an .lrc) first.");
      return;
    }
    try {
      const format = detectFormat(text) ?? "lrc";
      setLyrics(parse(format, text));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read those lyrics.");
      setLyrics(null);
    }
  }

  return (
    <div>
      {!lyrics ? (
        <ToolCard>
          <label className="mb-4 flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-white/[0.15] px-4 py-3 text-[13px] text-white/70 transition-colors hover:border-white/30">
            <Upload className="h-4 w-4" />
            {audioFile ? audioFile.name : "Choose an audio file (MP3, WAV, FLAC)"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <ToolLabel>Synced lyrics</ToolLabel>
          <ToolTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="[00:12.00]Paste your .lrc (or .srt / .vtt) here"
            spellCheck={false}
          />
          {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}
          <div className="mt-4">
            <ToolButton onClick={load}>
              <Music className="h-4 w-4" /> Preview
            </ToolButton>
          </div>
        </ToolCard>
      ) : (
        <div>
          <LyricsPlayer
            audioUrl={audioUrl}
            lyrics={lyrics}
            title={audioFile?.name.replace(/\.[^.]+$/, "") ?? "Preview"}
            meta={`${lyrics.lines.length} lines`}
            baseName={audioFile?.name.replace(/\.[^.]+$/, "") ?? "lyrics"}
            showDownloads
          />
          <div className="mt-3">
            <ToolButton
              variant="ghost"
              onClick={() => {
                setLyrics(null);
                setError(null);
              }}
            >
              Start over
            </ToolButton>
          </div>
        </div>
      )}

      <ToolFunnelCta />
    </div>
  );
}
