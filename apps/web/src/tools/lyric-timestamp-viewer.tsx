import { useState } from "react";
import { Pause, Play, Upload } from "lucide-react";
import { detectFormat, parse } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { useObjectUrl } from "@/hooks/use-object-url";
import { useWavesurfer } from "@/hooks/use-wavesurfer";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";
import { cn } from "@/lib/utils";

const EXAMPLE = [
  "[00:00.60]Stomp, stomp, tiny feet",
  "[00:03.18]Boom, boom, monster beat",
  "[00:05.66]Roar, roar, not too loud",
  "[00:08.12]Jump, jump, shake the crowd",
].join("\n");

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.round((t % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

/** Results view. Owns the wavesurfer instance so its container is already in the
 *  DOM when the hook initializes (the player only mounts once we have lyrics). */
function TimestampResult({
  lyrics,
  audioFile,
  onReset,
}: {
  lyrics: Lyrics;
  audioFile: File | null;
  onReset: () => void;
}) {
  const audioUrl = useObjectUrl(audioFile);
  const { containerRef, currentTime, playPause, seek, isPlaying, isReady } = useWavesurfer(audioUrl);

  const activeIndex = lyrics.lines.reduce(
    (acc, line, i) => (currentTime >= line.start ? i : acc),
    -1,
  );

  return (
    <ToolCard>
      {audioUrl && (
        <div className="mb-4">
          <div ref={containerRef} className="mb-3" />
          <ToolButton variant="ghost" onClick={playPause} disabled={!isReady}>
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? "Pause" : "Play"}
          </ToolButton>
        </div>
      )}
      <div className="max-h-[440px] overflow-y-auto rounded-lg border border-white/[0.06]">
        {lyrics.lines.map((line, i) => (
          <button
            key={i}
            onClick={() => audioUrl && seek(line.start)}
            className={cn(
              "flex w-full items-baseline gap-3 border-b border-white/[0.04] px-3.5 py-2 text-left transition-colors last:border-0",
              i === activeIndex ? "bg-pulse/[0.1]" : "hover:bg-white/[0.03]",
              audioUrl ? "cursor-pointer" : "cursor-default",
            )}
          >
            <span
              className={cn(
                "shrink-0 font-mono text-[12px] tabular-nums",
                i === activeIndex ? "text-pulse" : "text-white/40",
              )}
            >
              {fmtTime(line.start)}
            </span>
            <span className={cn("text-[14px]", i === activeIndex ? "text-white" : "text-white/70")}>
              {line.text}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-3">
        <ToolButton variant="ghost" onClick={onReset}>
          Start over
        </ToolButton>
      </div>
    </ToolCard>
  );
}

/** Read-only view of a synced-lyrics file's timestamps against the waveform.
 *  Upload audio (optional) + paste timed lyrics → every line with its exact
 *  start time; the active line tracks playback, click any line to jump. */
export function LyricTimestampViewer() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(source?: string) {
    const input = source ?? text;
    setError(null);
    if (!input.trim()) {
      setError("Paste your timed lyrics first, or load the example.");
      return;
    }
    try {
      const format = detectFormat(input) ?? "lrc";
      setLyrics(parse(format, input));
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
            {audioFile ? audioFile.name : "Choose an audio file (optional — for playback)"}
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <ToolLabel>Timed lyrics (.lrc / .srt / .vtt / .ttml)</ToolLabel>
            <button
              type="button"
              onClick={() => {
                setText(EXAMPLE);
                load(EXAMPLE);
              }}
              className="text-[12px] text-pulse hover:underline"
            >
              Try an example
            </button>
          </div>
          <ToolTextarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="[00:12.00]Paste your timed lyrics here"
            spellCheck={false}
          />
          {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}
          <div className="mt-4">
            <ToolButton onClick={() => load()}>View timestamps</ToolButton>
          </div>
        </ToolCard>
      ) : (
        <TimestampResult
          lyrics={lyrics}
          audioFile={audioFile}
          onReset={() => {
            setLyrics(null);
            setError(null);
          }}
        />
      )}

      <ToolFunnelCta />
    </div>
  );
}
