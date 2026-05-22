import { useState } from "react";
import { Download, Loader2, Package } from "lucide-react";
import { generate, LYRIC_FORMATS, type LyricFormat } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { downloadText, downloadZip } from "@/lib/download";

function fileNameFor(format: { id: LyricFormat; extension: string }, baseName: string): string {
  return format.id === "lrc-enhanced" ? `${baseName}-enhanced.lrc` : `${baseName}.${format.extension}`;
}

export function DownloadBar({ lyrics, baseName }: { lyrics: Lyrics; baseName: string }) {
  const [zipping, setZipping] = useState(false);

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

  return (
    <div className="flex flex-wrap gap-2">
      {LYRIC_FORMATS.map((format) => {
        const filename = fileNameFor(format, baseName);
        return (
          <button
            key={format.id}
            type="button"
            onClick={() => downloadText(filename, generate(format.id, lyrics), format.mime)}
            className="inline-flex items-center gap-1.5 rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.04] px-3.5 py-2.5 font-mono text-[12px] text-white transition-colors hover:border-pulse/50 hover:bg-white/[0.07]"
          >
            <Download className="h-3.5 w-3.5 text-pulse" />
            {format.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => void downloadAll()}
        disabled={zipping}
        className="inline-flex items-center gap-1.5 rounded-[10px] bg-pulse px-3.5 py-2.5 font-mono text-[12px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
      >
        {zipping ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Package className="h-3.5 w-3.5" />
        )}
        {zipping ? "Zipping…" : "Download all"}
      </button>
    </div>
  );
}
