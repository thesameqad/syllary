import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { downloadText } from "@/lib/download";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

/** Shift every timestamp in a pasted .lrc by a fixed millisecond offset. Pure
 *  client-side regex on the raw text so metadata tags are preserved. */
function shiftLrc(text: string, deltaMs: number): string {
  const shiftTag = (open: string, close: string) =>
    new RegExp(`\\${open}(\\d{1,2}):(\\d{2})(?:[.:](\\d{1,3}))?\\${close}`, "g");

  const apply = (mm: string, ss: string, frac: string | undefined, open: string, close: string) => {
    const digits = frac?.length ?? 2;
    const baseMs =
      (Number(mm) * 60 + Number(ss)) * 1000 + (frac ? Number(frac.padEnd(3, "0")) : 0);
    const total = Math.max(0, baseMs + deltaMs);
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor((total % 60000) / 1000);
    const ms = total % 1000;
    const fracOut =
      digits >= 3 ? String(ms).padStart(3, "0") : String(Math.round(ms / 10)).padStart(2, "0");
    return `${open}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${fracOut}${close}`;
  };

  return text
    .replace(shiftTag("[", "]"), (_m, a, b, c) => apply(a, b, c, "[", "]"))
    .replace(shiftTag("<", ">"), (_m, a, b, c) => apply(a, b, c, "<", ">"));
}

export function LrcOffsetAdjuster() {
  const [input, setInput] = useState("");
  const [offsetMs, setOffsetMs] = useState(0);
  const [output, setOutput] = useState("");
  const [copied, setCopied] = useState(false);

  function adjust() {
    // A positive offset makes the words appear LATER; a negative one, sooner.
    setOutput(shiftLrc(input, offsetMs));
  }

  function copy() {
    void navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div>
      <ToolCard>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <ToolLabel>Offset (milliseconds)</ToolLabel>
            <div className="flex items-center gap-2">
              <button
                className="rounded-lg border border-white/[0.1] px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.05]"
                onClick={() => setOffsetMs((v) => v - 100)}
              >
                −100
              </button>
              <input
                type="number"
                step={50}
                value={offsetMs}
                onChange={(e) => setOffsetMs(Number(e.target.value) || 0)}
                className="w-28 rounded-lg border border-white/[0.08] bg-void px-3 py-2 text-center text-[13px] text-white/90 outline-none focus:border-white/20"
              />
              <button
                className="rounded-lg border border-white/[0.1] px-3 py-2 text-[13px] text-white/80 hover:bg-white/[0.05]"
                onClick={() => setOffsetMs((v) => v + 100)}
              >
                +100
              </button>
            </div>
          </div>
          <p className="text-[12px] leading-relaxed text-white/45">
            Positive = lyrics appear <span className="text-white/70">later</span>; negative ={" "}
            <span className="text-white/70">sooner</span>.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <ToolLabel>Your .lrc</ToolLabel>
            <ToolTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="[00:12.00]Paste your .lrc here"
              spellCheck={false}
            />
          </div>
          <div>
            <ToolLabel>Adjusted .lrc</ToolLabel>
            <ToolTextarea value={output} readOnly placeholder="Result appears here" spellCheck={false} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <ToolButton onClick={adjust}>Apply offset</ToolButton>
          <ToolButton variant="ghost" onClick={copy} disabled={!output}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </ToolButton>
          <ToolButton
            variant="ghost"
            onClick={() => downloadText("lyrics.lrc", output, "text/plain")}
            disabled={!output}
          >
            <Download className="h-4 w-4" />
            Download
          </ToolButton>
        </div>
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
