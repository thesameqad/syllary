import { useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel, ToolTextarea } from "./tool-kit";

type Issue = { line: number; severity: "error" | "warning"; message: string };

const TIME_TAG = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function tagToMs(mm: string, ss: string, frac: string | undefined): number {
  return (Number(mm) * 60 + Number(ss)) * 1000 + (frac ? Number(frac.padEnd(3, "0")) : 0);
}

/** Validate a pasted .lrc: malformed/out-of-order timestamps, lyric lines with
 *  no timing, and likely encoding issues. Pure client-side, no audio. */
function validateLrc(text: string): Issue[] {
  const issues: Issue[] = [];
  if (text.charCodeAt(0) === 0xfeff) {
    issues.push({ line: 1, severity: "warning", message: "File starts with a BOM — save as UTF-8 without BOM for best compatibility." });
  }
  if (/[Ä-ÿ]½|锘/.test(text)) {
    issues.push({ line: 1, severity: "warning", message: "Possible non-UTF-8 encoding (GB2312/GBK). Re-save as UTF-8." });
  }

  let lastMs = -1;
  let timedLines = 0;
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (!line) return;
    if (/^\[[a-z]+:/i.test(line)) return; // metadata tag — fine

    const stamps = [...line.matchAll(TIME_TAG)];
    const hasBracket = line.includes("[");
    if (stamps.length === 0) {
      if (hasBracket) {
        issues.push({ line: n, severity: "error", message: "Looks like a timestamp but the format is invalid (expected [mm:ss.xx])." });
      } else {
        issues.push({ line: n, severity: "warning", message: "Lyric line has no timestamp — it won't sync." });
      }
      return;
    }
    timedLines++;
    for (const s of stamps) {
      const ms = tagToMs(s[1]!, s[2]!, s[3]);
      if (Number(s[2]) > 59) {
        issues.push({ line: n, severity: "error", message: `Seconds value ${s[2]} is out of range (00–59).` });
      }
      if (ms < lastMs) {
        issues.push({ line: n, severity: "warning", message: "Timestamp is earlier than the previous line (out of order)." });
      }
      lastMs = Math.max(lastMs, ms);
    }
  });

  if (timedLines === 0) {
    issues.push({ line: 1, severity: "error", message: "No valid timestamped lyric lines found." });
  }
  return issues;
}

export function LrcValidator() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<Issue[] | null>(null);

  function run() {
    setResult(validateLrc(input));
  }

  const errors = result?.filter((i) => i.severity === "error").length ?? 0;
  const warnings = result?.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <div>
      <ToolCard>
        <ToolLabel>Your .lrc</ToolLabel>
        <ToolTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="[00:12.00]Paste your .lrc to check it"
          spellCheck={false}
        />
        <div className="mt-4">
          <ToolButton onClick={run}>Check file</ToolButton>
        </div>

        {result && (
          <div className="mt-5">
            {result.length === 0 ? (
              <p className="flex items-center gap-2 text-[14px] text-success">
                <CheckCircle2 className="h-4 w-4" /> No problems found — this .lrc looks valid.
              </p>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-white/55">
                  {errors} error{errors === 1 ? "" : "s"}, {warnings} warning{warnings === 1 ? "" : "s"}.
                </p>
                <ul className="space-y-2">
                  {result.map((issue, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-[13px]">
                      {issue.severity === "error" ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-pulse" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                      )}
                      <span className="text-white/75">
                        <span className="font-mono text-white/45">line {issue.line}</span> — {issue.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
