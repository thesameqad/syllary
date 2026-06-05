import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { detectFormat, parse } from "@syllary/lyrics";
import { downloadText } from "@/lib/download";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

/** Strip all timing/markup from LRC/TTML/SRT/VTT → clean plain text. Reuses the
 *  shared parsers; if the input has no timing it's already plain text. */
export function PlainLyricsExtractor() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function extract() {
    setError(null);
    if (!input.trim()) {
      setError("Paste a lyrics file first.");
      setOutput("");
      return;
    }
    const format = detectFormat(input);
    if (!format) {
      // No timing markup detected — treat as already-plain text.
      setOutput(input.trim());
      return;
    }
    try {
      const lyrics = parse(format, input);
      setOutput(lyrics.lines.map((l) => l.text).join("\n"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this input.");
    }
  }

  function copy() {
    void navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <ToolCard>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <ToolLabel>Timed lyrics (.lrc / .srt / .vtt / .ttml)</ToolLabel>
            <ToolTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste your timed lyrics file"
              spellCheck={false}
            />
          </div>
          <div>
            <ToolLabel>Plain lyrics</ToolLabel>
            <ToolTextarea value={output} readOnly placeholder="Clean text appears here" spellCheck={false} />
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <ToolButton onClick={extract}>Extract text</ToolButton>
          <ToolButton variant="ghost" onClick={copy} disabled={!output}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </ToolButton>
          <ToolButton
            variant="ghost"
            onClick={() => downloadText("lyrics.txt", output + "\n", "text/plain")}
            disabled={!output}
          >
            <Download className="h-4 w-4" />
            Download .txt
          </ToolButton>
        </div>
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
