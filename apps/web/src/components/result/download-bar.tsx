import { Download } from "lucide-react";
import { generate, LYRIC_FORMATS } from "@syllary/lyrics";
import type { Lyrics } from "@syllary/shared";
import { downloadText } from "@/lib/download";

export function DownloadBar({ lyrics, baseName }: { lyrics: Lyrics; baseName: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {LYRIC_FORMATS.map((format) => {
        const filename =
          format.id === "lrc-enhanced"
            ? `${baseName}-enhanced.lrc`
            : `${baseName}.${format.extension}`;
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
    </div>
  );
}
