import { useMemo } from "react";
import { Download, Package, Play } from "lucide-react";
import { DEMO_TRACK, downloadAllSamples, downloadSample, type DemoFormat } from "./demo-data";

const FORMATS: DemoFormat[] = ["lrc", "ttml", "srt", "vtt", "txt"];
const BAR_COUNT = 56;
const PLAYED = 0.55;

function useWaveform() {
  return useMemo(
    () =>
      Array.from({ length: BAR_COUNT }, (_, i) => {
        const wave = Math.sin(i * 0.5) * 0.3 + Math.sin(i * 1.7) * 0.2;
        const jitter = ((i * 9301 + 49297) % 233280) / 233280;
        return Math.round((0.35 + Math.abs(wave) * 0.4 + jitter * 0.25) * 100);
      }),
    [],
  );
}

export function LivePreview() {
  const bars = useWaveform();

  return (
    <section id="preview" className="scroll-mt-20 bg-[#060606] px-6 py-20 sm:px-8 md:py-28">
      <div className="mb-12 text-center">
        <p className="mb-3 text-[11px] uppercase tracking-[3px] text-pulse/70">Live preview</p>
        <h2 className="text-[clamp(1.9rem,4vw,36px)] font-medium tracking-[-1.2px] text-white">
          Watch the words light up.
        </h2>
      </div>

      <div className="js-demo-card mx-auto max-w-[580px] rounded-[20px] border-[0.5px] border-white/[0.08] bg-[linear-gradient(180deg,#161616_0%,#0d0d0d_100%)] p-7 shadow-[0_40px_80px_rgba(0,0,0,0.5),0_0_80px_rgba(255,45,45,0.08)]">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#FF2D2D] to-[#8B0000] shadow-[0_4px_16px_rgba(255,45,45,0.4)]">
              <Play className="h-3.5 w-3.5 fill-white text-white" />
            </span>
            <div>
              <div className="text-[15px] font-medium text-white">{DEMO_TRACK.file}</div>
              <div className="text-[12px] text-white/40">
                {DEMO_TRACK.duration} · Processed in {DEMO_TRACK.processedIn}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/[0.12] px-3 py-[5px] text-[11px] font-medium text-success">
            <span className="h-[5px] w-[5px] rounded-full bg-success" />
            Platform-ready
          </span>
        </div>

        <div className="js-waveform mb-6 flex h-14 origin-left items-center gap-[2px]">
          {bars.map((h, i) => (
            <span
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${h}%`,
                background: i / BAR_COUNT < PLAYED ? "#FF2D2D" : "rgba(255,255,255,0.18)",
              }}
            />
          ))}
        </div>

        <div className="mb-6 text-left">
          <span className="mb-3.5 inline-flex items-center gap-2 rounded-full bg-pulse/[0.08] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[1.5px] text-[#FF6B6B]">
            <span className="h-[5px] w-[5px] rounded-full bg-pulse" />
            Verse 1 · 0:14
          </span>
          <p className="js-lyric-line text-[17px] leading-[1.8] text-white/25">
            Streetlights flicker on the avenue
          </p>
          <p className="js-lyric-line text-[19px] leading-[1.8] text-white">
            I keep{" "}
            <span className="rounded-[6px] bg-pulse px-2.5 py-0.5 text-white shadow-[0_0_24px_rgba(255,45,45,0.6)]">
              walking
            </span>{" "}
            till the morning&apos;s through
          </p>
          <p className="js-lyric-line text-[17px] leading-[1.8] text-white/25">
            Counting every breath I take
          </p>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/[0.06] pt-[18px]">
          {FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => downloadSample(format)}
              className="inline-flex items-center gap-1.5 rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[12px] text-white transition-colors hover:border-pulse/50 hover:bg-white/[0.07]"
            >
              <Download className="h-3.5 w-3.5 text-pulse" />.{format}
            </button>
          ))}
          <button
            type="button"
            onClick={downloadAllSamples}
            className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-3.5 py-2.5 text-[12px] font-medium text-white transition-transform hover:scale-[1.03]"
          >
            <Package className="h-3.5 w-3.5" />
            Download all
          </button>
        </div>
      </div>
    </section>
  );
}
