import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { LANDING_CATEGORIES, type LandingPage } from "@syllary/shared";
import { captureClient } from "@/lib/analytics";
import { ApiError, getLanding } from "@/lib/api";
import { LogoWordmark } from "@/components/logo";
import { LandingBlocks } from "@/components/landing/landing-blocks";
import { LandingHero } from "@/components/landing/landing-hero";
import { ToolHost } from "@/tools/registry";
import { useSeo } from "@/lib/seo";

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-void/85 backdrop-blur">
      <div className="mx-auto flex h-[54px] max-w-6xl items-center justify-between px-5">
        <Link to="/" aria-label="Syllary home">
          <LogoWordmark />
        </Link>
        <a
          href="#start"
          className="rounded-lg bg-pulse px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-pulse/90"
        >
          Try it free
        </a>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-white/[0.06] py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 text-[12px] text-white/40">
        <Link to="/" aria-label="Syllary home" className="w-fit">
          <LogoWordmark />
        </Link>
        <p>Upload your track. Get every lyric file the platforms need — synced and ready to ship.</p>
      </div>
    </footer>
  );
}

function categoryLabel(category: LandingPage["category"]): string {
  return LANDING_CATEGORIES.find((c) => c.id === category)?.label ?? category;
}

/** Build schema.org JSON-LD: a primary node (HowTo when the page has numbered
 *  steps, else SoftwareApplication for tool/convert pages, else Article), a
 *  BreadcrumbList, an optional DefinedTerm ("what is" pages) and FAQPage. */
function buildJsonLd(page: LandingPage, url: string): Record<string, unknown> {
  const origin = new URL(url).origin;

  const stepsBlock = page.blocks.find((b) => b.kind === "steps");
  const definitionBlock = page.blocks.find((b) => b.kind === "definition");

  let primary: Record<string, unknown>;
  if (stepsBlock && stepsBlock.kind === "steps") {
    primary = {
      "@type": "HowTo",
      name: page.title,
      url,
      step: stepsBlock.items.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: s.text ?? s.title,
      })),
    };
  } else if (page.category === "tools" || page.category === "convert") {
    primary = {
      "@type": "SoftwareApplication",
      name: page.title,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url,
    };
  } else {
    primary = { "@type": "Article", headline: page.title, url };
  }

  const graph: Record<string, unknown>[] = [
    primary,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: categoryLabel(page.category) },
        { "@type": "ListItem", position: 3, name: page.title, item: url },
      ],
    },
  ];
  if (definitionBlock && definitionBlock.kind === "definition") {
    graph.push({
      "@type": "DefinedTerm",
      name: definitionBlock.term,
      description: definitionBlock.text,
    });
  }
  if (page.faq && page.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: page.faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export function SeoLandingPage() {
  const { pathname } = useLocation();
  const slug = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
  const [page, setPage] = useState<LandingPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notfound" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setPage(null);
    getLanding(slug)
      .then((p) => {
        if (!active) return;
        setPage(p);
        setStatus("ready");
        captureClient("landing_viewed", { slug: p.slug, category: p.category });
      })
      .catch((err) => {
        if (!active) return;
        setStatus(err instanceof ApiError && err.status === 404 ? "notfound" : "error");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  const seo = useMemo(() => {
    if (!page) return null;
    const url = page.canonicalUrl ?? `${window.location.origin}/${page.slug}`;
    return {
      title: page.metaTitle,
      description: page.metaDescription,
      canonical: url,
      ogType: "website",
      image: page.ogImageUrl ?? undefined,
      noindex: page.noindex,
      jsonLd: buildJsonLd(page, url),
    };
  }, [page]);
  useSeo(seo);

  const showStandaloneTool =
    page?.renderType === "tool" &&
    page.toolKey != null &&
    !page.blocks.some((b) => b.kind === "toolEmbed");

  return (
    <div className="min-h-dvh bg-void text-white">
      <Nav />

      {status === "loading" && (
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-5 py-20 text-[14px] text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {status === "notfound" && (
        <div className="mx-auto max-w-3xl px-5 py-20 text-center">
          <h1 className="text-[22px] font-medium text-white">Page not found</h1>
          <p className="mt-2 text-[14px] text-white/55">This page isn&apos;t available.</p>
          <Link to="/" className="mt-5 inline-block text-[13px] text-pulse hover:underline">
            Go to Syllary →
          </Link>
        </div>
      )}

      {status === "error" && (
        <p className="mx-auto max-w-3xl px-5 py-20 text-center text-[14px] text-white/55">
          Something went wrong loading this page.
        </p>
      )}

      {status === "ready" && page && (
        <>
          <LandingHero page={page} />
          <main className="mx-auto max-w-6xl px-5 py-12">
            {/* Original guide content, kept for SEO depth + Ads quality. The
                hero already shows the how-it-works flow, so drop the duplicate
                `steps` block here (it stays in page.blocks for the HowTo JSON-LD)
                and frame the rest as a clearly separate reference section.
                Full-width divider, but the prose stays in a readable column
                left-aligned to the hero's left edge. */}
            <div className="border-t border-white/[0.06] pt-10">
              <p className="mb-6 text-[12px] uppercase tracking-[0.18em] text-white/35">
                Learn more
              </p>
              <LandingBlocks blocks={page.blocks.filter((b) => b.kind !== "steps")} />
              {showStandaloneTool && page.toolKey && (
                <div className="mt-8">
                  <ToolHost toolKey={page.toolKey} />
                </div>
              )}
              {page.faq && page.faq.length > 0 && (
                <section className="mt-12">
                  <h2 className="text-[26px] font-medium tracking-[-0.5px] text-white">
                    Frequently asked questions
                  </h2>
                  <dl className="mt-5 space-y-5">
                    {page.faq.map((item, i) => (
                      <div key={i}>
                        <dt className="text-[15px] font-medium text-white">{item.q}</dt>
                        <dd className="mt-1.5 text-[15px] leading-[1.7] text-white/65">{item.a}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </div>
          </main>
        </>
      )}

      <Footer />
    </div>
  );
}
