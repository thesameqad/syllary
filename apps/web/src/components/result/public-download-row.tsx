import { useState } from "react";
import { ChevronDown, Loader2, Package } from "lucide-react";
import { generate, LYRIC_FORMATS, type LyricFormat } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { downloadText, downloadZip } from "@/lib/download";
import { Modal } from "@/components/ui/modal";

const DEFAULT_IDS: LyricFormat[] = ["lrc", "txt", "srt"];

const FORMAT_HELP: { id: LyricFormat; label: string; use: string }[] = [
  { id: "lrc", label: ".lrc", use: "Line-synced lyrics — Spotify, Apple Music, most distributors." },
  { id: "lrc-enhanced", label: ".lrc enhanced", use: "Word-by-word karaoke timing where supported." },
  { id: "ttml", label: ".ttml", use: "Apple Music's preferred word-synced format." },
  { id: "srt", label: ".srt", use: "Subtitles for YouTube and video editors." },
  { id: "vtt", label: ".vtt", use: "Web video captions (HTML5 / WebVTT)." },
  { id: "txt", label: ".txt", use: "Plain lyrics — anywhere text is accepted." },
  { id: "json", label: ".json", use: "Raw timed data for your own tooling." },
];

function fileNameFor(format: { id: LyricFormat; extension: string }, baseName: string): string {
  return format.id === "lrc-enhanced" ? `${baseName}-enhanced.lrc` : `${baseName}.${format.extension}`;
}

const BTN =
  "inline-flex items-center gap-1.5 rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[12px] text-white transition-colors hover:border-pulse/50 hover:bg-white/[0.07]";

export function PublicDownloadRow({ lyrics, baseName }: { lyrics: Lyrics; baseName: string }) {
  const [showMore, setShowMore] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const defaults = LYRIC_FORMATS.filter((f) => DEFAULT_IDS.includes(f.id));
  const extras = LYRIC_FORMATS.filter((f) => !DEFAULT_IDS.includes(f.id));

  async function downloadAll() {
    setZipping(true);
    try {
      await downloadZip(
        `${baseName}-lyrics.zip`,
        LYRIC_FORMATS.map((format) => ({
          filename: fileNameFor(format, baseName),
          content: generate(format.id, lyrics),
        })),
      );
    } finally {
      setZipping(false);
    }
  }

  function DownloadButton({ format }: { format: (typeof LYRIC_FORMATS)[number] }) {
    return (
      <button
        type="button"
        onClick={() => downloadText(fileNameFor(format, baseName), generate(format.id, lyrics), format.mime)}
        className={BTN}
      >
        <span className="text-pulse">↓</span>
        {format.label}
      </button>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {defaults.map((format) => (
          <DownloadButton key={format.id} format={format} />
        ))}

        {showMore && extras.map((format) => <DownloadButton key={format.id} format={format} />)}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1 rounded-[10px] border-[0.5px] border-white/10 bg-transparent px-3.5 py-2.5 text-[12px] text-white/70 transition-colors hover:text-white"
        >
          {showMore ? "Fewer formats" : "More formats"}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>

        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="text-[11px] text-white/40 underline decoration-white/20 underline-offset-[3px] transition-colors hover:text-white/70"
        >
          What format do I need?
        </button>

        <button
          type="button"
          onClick={() => void downloadAll()}
          disabled={zipping}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-3.5 py-2.5 text-[12px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
          {zipping ? "Zipping…" : "Download all"}
        </button>
      </div>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Which format do I need?">
        <div className="space-y-3">
          {FORMAT_HELP.map((f) => (
            <div key={f.id} className="flex gap-3">
              <span className="w-[110px] shrink-0 font-mono text-[12px] text-white">{f.label}</span>
              <span className="text-[13px] text-white/55">{f.use}</span>
            </div>
          ))}
          <p className="border-t border-white/[0.06] pt-3 text-[12px] text-white/40">
            Not sure? Most distributors (DistroKid, TuneCore, CD Baby) accept{" "}
            <span className="font-mono text-white/70">.lrc</span>. Grab “Download all” to be safe.
          </p>
        </div>
      </Modal>
    </>
  );
}
