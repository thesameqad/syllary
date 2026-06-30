import { type ReactNode, useState } from "react";
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
  describeLabel = "Describe your cover",
  placeholder = "e.g. a lone figure on a neon-lit rooftop at night, moody and cinematic",
  saveLabel = "Save cover",
  savedToast = "Cover updated.",
  hideModelPicker = false,
  forcedModel,
  onSuggest,
  previewAspect = "square",
}: {
  defaultPrompt: string;
  onGenerate: (prompt: string, model: CoverModel) => Promise<{ key: string; url: string }>;
  onCommit: (key: string) => Promise<void>;
  onCancel: () => void;
  /** Copy overrides so the panel can drive element images, not just covers. */
  describeLabel?: ReactNode;
  placeholder?: string;
  saveLabel?: string;
  savedToast?: string;
  /** Hide the model grid (e.g. customized cast members are locked to one model). */
  hideModelPicker?: boolean;
  /** Force the model used for generation (defaults to "flux"). */
  forcedModel?: CoverModel;
  /** When set, renders a "Suggest with AI" affordance that fills the prompt. */
  onSuggest?: () => Promise<string>;
  /** Preview frame shape: "square" for covers, "portrait" for full-body character
   *  references (9:16, shown whole so the body isn't cropped). */
  previewAspect?: "square" | "portrait";
}) {
  const toast = useToast();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [model, setModel] = useState<CoverModel>(forcedModel ?? "flux");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
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
      toast(savedToast);
    } catch (e) {
      setSaving(false);
      toast(e instanceof ApiError ? e.message : "Couldn't save the image.", "error");
    }
  }

  async function suggest() {
    if (!onSuggest) return;
    setSuggesting(true);
    try {
      const text = await onSuggest();
      if (text.trim()) setPrompt(text.trim());
      else toast("Couldn't suggest a look — try writing one.", "error");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't suggest a look.", "error");
    } finally {
      setSuggesting(false);
    }
  }

  const working = busy || saving || suggesting;

  return (
    <div>
      {/* Stack preview over the description on phones (a side-by-side input is too
          narrow on mobile); side-by-side from sm up. */}
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start">
        {/* Preview / placeholder */}
        <div
          className={cn(
            "relative shrink-0 self-center overflow-hidden rounded-[12px] border border-white/10 bg-black/40 sm:self-auto",
            previewAspect === "portrait" ? "h-56 w-[126px]" : "h-40 w-40",
          )}
        >
          {preview ? (
            <img
              src={preview.url}
              alt="Generated reference"
              className={cn(
                "h-full w-full",
                previewAspect === "portrait" ? "object-contain" : "object-cover",
              )}
            />
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
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.5px] text-white/40">
              {describeLabel}
            </span>
            {onSuggest && (
              <button
                type="button"
                disabled={working}
                onClick={() => void suggest()}
                className="inline-flex items-center gap-1 text-[11px] text-pulse transition-colors hover:text-white disabled:opacity-50"
              >
                {suggesting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Suggest with AI
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            disabled={working}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder={placeholder}
            className="mt-1.5 w-full resize-none rounded-[10px] border border-white/10 bg-black/30 px-3 py-2 text-[13px] leading-relaxed text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-pulse/50 disabled:opacity-60"
          />
        </div>
      </div>

      {/* Model picker */}
      {!hideModelPicker && (
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
      )}

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-4">
        {/* Cancel is hidden on mobile (3 buttons wrap on a phone) — the modal's X /
            backdrop still cancels; shown from sm up. */}
        <button
          type="button"
          disabled={working}
          onClick={onCancel}
          className="hidden rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60 sm:block"
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
              {/* Decorative icons hidden on mobile to keep buttons on one line. */}
              <RefreshCw className="hidden h-4 w-4 text-pulse sm:inline-block" />
              Regenerate · {cost}
            </button>
            <button
              type="button"
              disabled={working}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImageIcon className="hidden h-4 w-4 sm:inline-block" />
              )}
              {saving ? "Saving…" : saveLabel}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={working}
            onClick={() => void generate()}
            className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="hidden h-4 w-4 sm:inline-block" />
            )}
            {busy ? "Generating…" : `Generate · ${cost} tokens`}
          </button>
        )}
      </div>
    </div>
  );
}
