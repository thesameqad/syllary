import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { ToolCard, ToolFunnelCta } from "./tool-kit";

type Result = { duration: number; silence: number; sampleRate: number };

function fmtClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

/** Decode an audio file in the browser (Web Audio) and report its exact
 *  duration + how much silence there is before the first sound (lead-in). Handy
 *  for setting a lyric offset. Nothing is uploaded. */
export function DurationSilenceDetector() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function analyze(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Your browser doesn't support audio decoding.");
      const ctx = new Ctx();
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
      const data = buffer.getChannelData(0);
      const threshold = 0.01;
      let i = 0;
      while (i < data.length && Math.abs(data[i]!) <= threshold) i++;
      const silence = i >= data.length ? 0 : i / buffer.sampleRate;
      setResult({ duration: buffer.duration, silence, sampleRate: buffer.sampleRate });
      void ctx.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that audio file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ToolCard>
        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-white/[0.15] px-4 py-3.5 text-[13px] text-white/70 transition-colors hover:border-white/30">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Analyzing…" : (fileName ?? "Choose an audio file (MP3, WAV, FLAC)")}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void analyze(f);
            }}
          />
        </label>

        {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}

        {result && (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.08] bg-void px-4 py-3.5">
              <div className="text-[24px] font-medium tracking-tight text-white tabular-nums">
                {fmtClock(result.duration)}
              </div>
              <div className="mt-0.5 text-[12px] text-white/45">Duration (m:ss.mmm)</div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-void px-4 py-3.5">
              <div className="text-[24px] font-medium tracking-tight text-white tabular-nums">
                {Math.round(result.silence * 1000)} ms
              </div>
              <div className="mt-0.5 text-[12px] text-white/45">Lead-in silence</div>
            </div>
            <div className="rounded-xl border border-white/[0.08] bg-void px-4 py-3.5">
              <div className="text-[24px] font-medium tracking-tight text-white tabular-nums">
                {(result.sampleRate / 1000).toFixed(1)} kHz
              </div>
              <div className="mt-0.5 text-[12px] text-white/45">Sample rate</div>
            </div>
          </div>
        )}

        {result && result.silence > 0.05 && (
          <p className="mt-4 text-[13px] leading-relaxed text-white/55">
            There&apos;s about <span className="text-white">{Math.round(result.silence * 1000)} ms</span> of
            silence before the first sound. If your lyrics start late, try a negative offset of roughly
            that much in the LRC offset adjuster.
          </p>
        )}
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
