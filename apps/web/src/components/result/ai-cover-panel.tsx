import { useState } from "react";
import { Image as ImageIcon, Loader2, RefreshCw, Sparkles } from "lucide-react";
import {
  COVER_MODELS,
  COVER_MODEL_INFO,
  coverImageTokens,
  type CoverModel,
} from "@syllary/shared";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/** Cheapest cover-generation price, shown as the "from N tokens" hint elsewhere. */
export const COVER_TOKENS_FROM = coverImageTokens("flux");

/** In-modal panel to AI-generate a square cover: pick a model, describe →
 *  generate → preview, then regenerate, save, or cancel. Source-agnostic — the
 *  caller wires generate/commit to a song or an artist/album entity. The commit
 *  callback owns the post-save UI (update parent state, close the panel). */
export function AiCoverPanel({
  defaultPrompt,
  onGenerate,
  onCommit,
  onCancel,
}: {
  defaultPrompt: string;
  onGenerate: (prompt: string, model: CoverModel) => Promise<{ key: string; url: string }>;
  onCommit: (key: string) => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [model, setModel] = useState<CoverModel>("flux");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ key: string; url: string } | null>(null);

  const cost = coverImageTokens(model);

  async function generate() {
    if (!prompt.trim()) {
      toast("Describe the cover you want.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await onGenerate(prompt.trim(), model);
      setPreview({ key: res.key, url: res.url });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't generate the cover.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!preview) return;
    setSaving(true);
    try {
      await onCommit(preview.key);
      toast("Cover updated.");
    } catch (e) {
      setSaving(false);
      toast(e instanceof ApiError ? e.message : "Couldn't save the image.", "error");
    }
  }

  const working = busy || saving;

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* Preview / placeholder */}
        <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-[12px] border border-white/10 bg-black/40">
          {preview ? (
            <img src={preview.url} alt="Generated cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/30">
              <Sparkles className="h-7 w-7" />
              <span className="text-[11px] text-white/40">Preview appears here</span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55">
              <Loader2 className="h-7 w-7 animate-spin text-pulse" />
              <span className="text-[11px] text-white/70">Painting…</span>
            </div>
          )}
        </div>

        {/* Prompt */}
        <div className="min-w-0 flex-1">
          <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
            Describe your cover
          </span>
          <textarea
            value={prompt}
            disabled={working}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder="e.g. a lone figure on a neon-lit rooftop at night, moody and cinematic"
            className="mt-1.5 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/50 disabled:opacity-60"
          />
        </div>
      </div>

      {/* Model picker */}
      <div className="mt-4">
        <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">Quality</span>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {COVER_MODELS.map((m) => {
            const sel = m === model;
            return (
              <button
                key={m}
                type="button"
                disabled={working}
                onClick={() => setModel(m)}
                className={cn(
                  "rounded-[10px] border px-3 py-2 text-left transition-colors disabled:opacity-60",
                  sel
                    ? "border-pulse/60 bg-pulse/[0.08]"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium text-white">
                    {COVER_MODEL_INFO[m].label}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      sel ? "bg-pulse/20 text-pulse" : "bg-white/[0.06] text-white/55",
                    )}
                  >
                    {coverImageTokens(m)} tokens
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-white/45">
                  {COVER_MODEL_INFO[m].description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
        <button
          type="button"
          disabled={working}
          onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
        >
          Cancel
        </button>
        {preview ? (
          <>
            <button
              type="button"
              disabled={working}
              onClick={() => void generate()}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white/80 transition-colors hover:border-pulse/50 hover:text-white disabled:opacity-60"
            >
              <RefreshCw className="h-4 w-4 text-pulse" />
              Regenerate · {cost}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {saving ? "Saving…" : "Save cover"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={working}
            onClick={() => void generate()}
            className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Generating…" : `Generate · ${cost} tokens`}
          </button>
        )}
      </div>
    </div>
  );
}
