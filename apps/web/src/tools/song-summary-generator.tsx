import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { SongInsights } from "@syllary/shared";
import { ApiError, generateToolSummary } from "@/lib/api";
import { ToolAuthNotice, ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

/** Paste lyrics → an AI summary, themes, and mood. Sign-in required (uses a few
 *  tokens per run). */
export function SongSummaryGenerator() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SongInsights | null>(null);

  async function run() {
    if (!text.trim()) {
      setError(new ApiError("Paste some lyrics first.", 400));
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await generateToolSummary(text));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
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
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Summarizing…" : "Generate summary"}
          </ToolButton>
        </div>
        {error ? <ToolAuthNotice error={error} /> : null}

        {result && (
          <div className="mt-5 space-y-4">
            <div>
              <ToolLabel>Summary</ToolLabel>
              <p className="text-[15px] leading-relaxed text-white/80">{result.summary}</p>
            </div>
            {result.themes.length > 0 && (
              <div>
                <ToolLabel>Themes</ToolLabel>
                <div className="flex flex-wrap gap-2">
                  {result.themes.map((t) => (
                    <span key={t} className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[12px] text-white/70">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.mood && (
              <div>
                <ToolLabel>Mood</ToolLabel>
                <p className="text-[14px] text-white/80">{result.mood}</p>
              </div>
            )}
          </div>
        )}
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
