import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import type { ToolSectionsResponse } from "@syllary/shared";
import { ApiError, findChorus } from "@/lib/api";
import { ToolAuthNotice, ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";
import { cn } from "@/lib/utils";

function isChorus(label: string): boolean {
  return /chorus|hook|refrain/i.test(label);
}

/** Paste lyrics → labeled sections (Verse / Chorus / Bridge…), with the chorus
 *  highlighted. Sign-in required (uses a few tokens per run). */
export function FindTheChorus() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ToolSectionsResponse | null>(null);

  async function run() {
    if (!text.trim()) {
      setError(new ApiError("Paste some lyrics first.", 400));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await findChorus(text));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Map line index → section label that starts there, and the active section
  // carried forward for every line (so the whole chorus block highlights).
  const labelByIndex = new Map(result?.sections.map((s) => [s.index, s.label]) ?? []);
  const activeSection: string[] = [];
  if (result) {
    let current = "";
    for (let i = 0; i < result.lines.length; i++) {
      current = labelByIndex.get(i) ?? current;
      activeSection[i] = current;
    }
  }

  return (
    <div>
      <ToolCard>
        <ToolLabel>Lyrics</ToolLabel>
        <ToolTextarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste your song's lyrics here"
          spellCheck={false}
        />
        <div className="mt-4">
          <ToolButton onClick={run} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Analyzing…" : "Find the chorus"}
          </ToolButton>
        </div>
        {error ? <ToolAuthNotice error={error} /> : null}

        {result && (
          <div className="mt-5 space-y-0.5">
            {result.lines.map((line, i) => {
              const label = labelByIndex.get(i);
              const inChorus = isChorus(activeSection[i] ?? "");
              return (
                <div key={i}>
                  {label && (
                    <div
                      className={cn(
                        "mt-3 mb-1 text-[11px] font-medium uppercase tracking-[0.12em]",
                        isChorus(label) ? "text-pulse" : "text-white/40",
                      )}
                    >
                      {label}
                    </div>
                  )}
                  <p
                    className={cn(
                      "text-[14px] leading-relaxed",
                      inChorus ? "text-white" : "text-white/70",
                    )}
                  >
                    {line || " "}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
