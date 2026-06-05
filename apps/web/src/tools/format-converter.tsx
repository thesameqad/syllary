import { useState } from "react";
import { Check, Copy, Download, Upload } from "lucide-react";
import {
  detectFormat,
  generate,
  INPUT_FORMATS,
  type InputFormat,
  LYRIC_FORMATS,
  type LyricFormat,
  parse,
} from "@syllary/lyrics";
import { downloadText } from "@/lib/download";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolSelect, ToolTextarea } from "./tool-kit";

/** Universal lyrics format converter. Parses any supported INPUT format (never
 *  JSON-as-input; never .ass/.pdf — SYLLARY.md §4) and re-emits any of the 7
 *  output formats via the existing generators. Runs entirely in the browser. */
export function FormatConverter() {
  const [input, setInput] = useState("");
  const [inFormat, setInFormat] = useState<InputFormat>("lrc");
  const [outFormat, setOutFormat] = useState<LyricFormat>("srt");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const outMeta = LYRIC_FORMATS.find((f) => f.id === outFormat)!;

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setInput(text);
      const guess = detectFormat(text);
      if (guess) setInFormat(guess);
    });
  }

  function convert() {
    setError(null);
    setOutput("");
    if (!input.trim()) {
      setError("Paste or upload a lyrics file first.");
      return;
    }
    try {
      const lyrics = parse(inFormat, input);
      setOutput(generate(outFormat, lyrics));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not convert this input.");
    }
  }

  function copy() {
    void navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function download() {
    downloadText(`lyrics.${outMeta.extension}`, output, outMeta.mime);
  }

  return (
    <div>
      <ToolCard>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <ToolLabel>From</ToolLabel>
            <ToolSelect
              value={inFormat}
              onChange={(e) => setInFormat(e.target.value as InputFormat)}
            >
              {INPUT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </ToolSelect>
          </div>
          <div>
            <ToolLabel>To</ToolLabel>
            <ToolSelect
              value={outFormat}
              onChange={(e) => setOutFormat(e.target.value as LyricFormat)}
            >
              {LYRIC_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </ToolSelect>
          </div>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[13px] text-white/80 transition-colors hover:bg-white/[0.05]">
            <Upload className="h-4 w-4" />
            Upload file
            <input type="file" accept=".lrc,.srt,.vtt,.ttml,.txt" className="hidden" onChange={onFile} />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <ToolLabel>Your lyrics file</ToolLabel>
            <ToolTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={"[00:12.00]Paste your .lrc / .srt / .vtt / .ttml / .txt here"}
              spellCheck={false}
            />
          </div>
          <div>
            <ToolLabel>Converted {outMeta.label}</ToolLabel>
            <ToolTextarea value={output} readOnly placeholder="Result appears here" spellCheck={false} />
          </div>
        </div>

        {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <ToolButton onClick={convert}>Convert</ToolButton>
          <ToolButton variant="ghost" onClick={copy} disabled={!output}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </ToolButton>
          <ToolButton variant="ghost" onClick={download} disabled={!output}>
            <Download className="h-4 w-4" />
            Download
          </ToolButton>
        </div>
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
