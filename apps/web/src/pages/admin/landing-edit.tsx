import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import {
  type CreateLanding,
  faqItemSchema,
  type LandingCategory,
  LANDING_CATEGORIES,
  landingBlockSchema,
  type LandingRenderType,
} from "@syllary/shared";
import {
  createLandingPage,
  getLandingPage,
  setLandingPublished,
  updateLandingPage,
} from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { TOOL_LIST } from "@/tools/registry";
import { AdminGuard } from "./admin-guard";

const blocksValidator = landingBlockSchema.array();
const faqValidator = faqItemSchema.array();

type FormState = {
  slug: string;
  category: LandingCategory;
  renderType: LandingRenderType;
  toolKey: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  ogImageKey: string;
  canonicalUrl: string;
  noindex: boolean;
  blocksText: string;
  faqText: string;
};

const EMPTY: FormState = {
  slug: "",
  category: "guides",
  renderType: "content",
  toolKey: "",
  title: "",
  metaTitle: "",
  metaDescription: "",
  ogImageKey: "",
  canonicalUrl: "",
  noindex: false,
  blocksText: "[]",
  faqText: "",
};

const inputCls =
  "w-full rounded-lg border border-white/[0.08] bg-void px-3 py-2 text-[13px] text-white/90 outline-none focus:border-white/20";
const labelCls = "mb-1 block text-[12px] text-white/55";

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-white/35">{hint}</p>}
    </div>
  );
}

function LandingEditInner() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    getLandingPage(id!)
      .then((p) => {
        setForm({
          slug: p.slug,
          category: p.category,
          renderType: p.renderType,
          toolKey: p.toolKey ?? "",
          title: p.title,
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          ogImageKey: p.ogImageKey ?? "",
          canonicalUrl: p.canonicalUrl ?? "",
          noindex: p.noindex,
          blocksText: JSON.stringify(p.blocks, null, 2),
          faqText: p.faq ? JSON.stringify(p.faq, null, 2) : "",
        });
        setStatus(p.status);
      })
      .catch((err) => toast(err instanceof Error ? err.message : "Could not load.", "error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Parse + validate the JSON content fields; returns null on error (toasts). */
  function buildPayload(): CreateLanding | null {
    let blocks: unknown;
    try {
      blocks = JSON.parse(form.blocksText || "[]");
    } catch {
      toast("Blocks isn't valid JSON.", "error");
      return null;
    }
    const blocksParsed = blocksValidator.safeParse(blocks);
    if (!blocksParsed.success) {
      toast(`Blocks: ${blocksParsed.error.issues[0]?.message ?? "invalid"}`, "error");
      return null;
    }

    let faq: CreateLanding["faq"] = null;
    if (form.faqText.trim()) {
      let raw: unknown;
      try {
        raw = JSON.parse(form.faqText);
      } catch {
        toast("FAQ isn't valid JSON.", "error");
        return null;
      }
      const faqParsed = faqValidator.safeParse(raw);
      if (!faqParsed.success) {
        toast(`FAQ: ${faqParsed.error.issues[0]?.message ?? "invalid"}`, "error");
        return null;
      }
      faq = faqParsed.data;
    }

    return {
      slug: form.slug.trim(),
      category: form.category,
      renderType: form.renderType,
      toolKey: form.renderType === "tool" ? form.toolKey || null : null,
      title: form.title.trim(),
      metaTitle: form.metaTitle.trim(),
      metaDescription: form.metaDescription.trim(),
      ogImageKey: form.ogImageKey.trim() || null,
      canonicalUrl: form.canonicalUrl.trim() || null,
      noindex: form.noindex,
      blocks: blocksParsed.data,
      faq,
    };
  }

  async function save() {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await createLandingPage(payload);
        toast("Page created.", "success");
        navigate(`/admin/landing/${created.id}`);
      } else {
        await updateLandingPage(id!, payload);
        toast("Saved.", "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (isNew) {
      toast("Save the page first.", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await setLandingPublished(id!, status !== "published");
      setStatus(updated.status);
      toast(updated.status === "published" ? "Published." : "Unpublished.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-[14px] text-white/50">Loading…</p>;

  return (
    <div className="max-w-3xl">
      <Link
        to="/admin/landing"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-white/50 hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" /> All pages
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[22px] font-medium tracking-tight text-white">
          {isNew ? "New landing page" : "Edit landing page"}
        </h1>
        {!isNew && (
          <span
            className={`rounded px-2 py-1 text-[11px] uppercase tracking-wide ${
              status === "published" ? "bg-success/15 text-success" : "bg-white/[0.06] text-white/45"
            }`}
          >
            {status}
          </span>
        )}
      </div>

      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              className={inputCls}
              value={form.category}
              onChange={(e) => set("category", e.target.value as LandingCategory)}
            >
              {LANDING_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} (/{c.prefix})
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Slug (full path)"
            hint="e.g. convert/lrc-to-srt — first segment must match the category."
          >
            <input className={inputCls} value={form.slug} onChange={(e) => set("slug", e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Render type">
            <select
              className={inputCls}
              value={form.renderType}
              onChange={(e) => set("renderType", e.target.value as LandingRenderType)}
            >
              <option value="content">Content (text)</option>
              <option value="tool">Tool (mounts a mini-tool)</option>
            </select>
          </Field>
          <Field label="Tool" hint={form.renderType === "tool" ? "Mounted after the content blocks (unless a toolEmbed block is used)." : "Only used for tool pages."}>
            <select
              className={inputCls}
              value={form.toolKey}
              disabled={form.renderType !== "tool"}
              onChange={(e) => set("toolKey", e.target.value)}
            >
              <option value="">— select a tool —</option>
              {TOOL_LIST.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Title (H1)">
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meta title">
            <input className={inputCls} value={form.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} />
          </Field>
          <Field label="Canonical URL (optional)">
            <input className={inputCls} value={form.canonicalUrl} onChange={(e) => set("canonicalUrl", e.target.value)} />
          </Field>
        </div>

        <Field label="Meta description">
          <textarea
            className={`${inputCls} min-h-[64px] resize-y`}
            value={form.metaDescription}
            onChange={(e) => set("metaDescription", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="OG image R2 key (optional)">
            <input className={inputCls} value={form.ogImageKey} onChange={(e) => set("ogImageKey", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-white/70">
            <input
              type="checkbox"
              checked={form.noindex}
              onChange={(e) => set("noindex", e.target.checked)}
            />
            noindex (exclude from search + sitemap)
          </label>
        </div>

        <Field label="Blocks (JSON)" hint='Array of content blocks, e.g. [{"kind":"paragraph","text":"…"}]. Kinds: heading, paragraph, list, callout, table, cta, image, toolEmbed, badges, steps, code, ctaCard, relatedLinks.'>
          <textarea
            className={`${inputCls} min-h-[220px] resize-y font-mono text-[12px]`}
            value={form.blocksText}
            onChange={(e) => set("blocksText", e.target.value)}
            spellCheck={false}
          />
        </Field>

        <Field label="FAQ (JSON, optional)" hint='Array of {"q":"…","a":"…"} — drives the FAQ section + FAQPage schema.'>
          <textarea
            className={`${inputCls} min-h-[120px] resize-y font-mono text-[12px]`}
            value={form.faqText}
            onChange={(e) => set("faqText", e.target.value)}
            spellCheck={false}
          />
        </Field>

        <div className="flex items-center gap-2.5 border-t border-white/[0.06] pt-5">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-lg bg-pulse px-4 py-2 text-[13px] font-medium text-white hover:bg-pulse/90 disabled:opacity-40"
          >
            {saving ? "Saving…" : isNew ? "Create page" : "Save changes"}
          </button>
          {!isNew && (
            <button
              onClick={() => void togglePublish()}
              disabled={saving}
              className="rounded-lg border border-white/[0.12] px-4 py-2 text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-40"
            >
              {status === "published" ? "Unpublish" : "Publish"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function LandingEditPage() {
  return (
    <AdminGuard>
      <LandingEditInner />
    </AdminGuard>
  );
}
