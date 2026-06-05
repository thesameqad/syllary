import { useState } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import type { LinkMatch } from "@syllary/shared";
import { getToolLinks } from "@/lib/api";
import { ToolButton, ToolCard, ToolFunnelCta, ToolLabel } from "./tool-kit";

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-void px-3 py-2 text-[13px] text-white/90 outline-none placeholder:text-white/25 focus:border-white/20";

function platformLabel(key: string): string {
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Find every streaming link for a track from a title + artist, or a pasted
 *  streaming URL. Free — no sign-in. */
export function StreamingLinkFinder() {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LinkMatch | null>(null);

  async function find() {
    if (!title.trim() && !artist.trim() && !url.trim()) {
      setError("Enter a song name, artist, or a streaming link.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await getToolLinks({ title, artist, url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't find links.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <ToolCard>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <ToolLabel>Song name</ToolLabel>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Midnight Drive" />
          </div>
          <div>
            <ToolLabel>Artist</ToolLabel>
            <input className={inputCls} value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="e.g. Your artist name" />
          </div>
        </div>
        <div className="mt-4">
          <ToolLabel>Or paste a streaming link</ToolLabel>
          <input className={inputCls} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://open.spotify.com/track/…" />
        </div>
        {error && <p className="mt-3 text-[13px] text-pulse">{error}</p>}
        <div className="mt-4">
          <ToolButton onClick={find} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {busy ? "Searching…" : "Find links"}
          </ToolButton>
        </div>

        {result && (
          <div className="mt-5">
            {result.links.length === 0 ? (
              <p className="text-[13px] text-white/55">No links found — try the full title and artist, or paste a link.</p>
            ) : (
              <>
                {(result.matchedTitle || result.matchedArtist) && (
                  <p className="mb-3 text-[13px] text-white/55">
                    Matched: <span className="text-white">{result.matchedTitle}</span>
                    {result.matchedArtist ? ` — ${result.matchedArtist}` : ""}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {result.links.map((l) => (
                    <a
                      key={l.platform}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-[13px] text-white/80 transition-colors hover:border-white/25 hover:text-white"
                    >
                      {platformLabel(l.platform)}
                      <ExternalLink className="h-3.5 w-3.5 text-white/40" />
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </ToolCard>

      <ToolFunnelCta />
    </div>
  );
}
