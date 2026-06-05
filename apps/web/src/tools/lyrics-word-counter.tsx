import { useMemo, useState } from "react";
import { detectFormat, parse } from "@syllary/lyrics";
import { ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

/** Count words, lines, unique words and characters from pasted lyrics. Strips
 *  timing first if a timed format is detected. Lowest-effort tool in the set. */
export function LyricsWordCounter() {
  const [input, setInput] = useState("");

  const stats = useMemo(() => {
    let text = input;
    const format = detectFormat(input);
    if (format) {
      try {
        text = parse(format, input)
          .lines.map((l) => l.text)
          .join("\n");
      } catch {
        // fall back to the raw text
      }
    }
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).length;
    const words = (text.match(/\b[\p{L}\p{N}']+\b/gu) ?? []).map((w) => w.toLowerCase());
    const unique = new Set(words).size;
    const chars = text.replace(/\s/g, "").length;
    return { lines, words: words.length, unique, chars };
  }, [input]);

  const cards: { label: string; value: number }[] = [
    { label: "Words", value: stats.words },
    { label: "Unique words", value: stats.unique },
    { label: "Lines", value: stats.lines },
    { label: "Characters", value: stats.chars },
  ];

  return (
    <div>
      <ToolCard>
        <ToolLabel>Lyrics (plain or timed)</ToolLabel>
        <ToolTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste lyrics — timing is stripped automatically"
          spellCheck={false}
        />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-white/[0.08] bg-void px-4 py-3.5">
              <div className="text-[26px] font-medium tracking-tight text-white tabular-nums">
                {c.value.toLocaleString()}
              </div>
              <div className="mt-0.5 text-[12px] text-white/45">{c.label}</div>
            </div>
          ))}
        </div>
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
