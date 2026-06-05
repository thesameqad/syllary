/**
 * Syllary SEO worker.
 *
 * The frontend is a static SPA, so crawlers and link-unfurlers (Slack, Twitter,
 * Facebook, etc.) that don't run JS only ever see the default <head>. This
 * worker sits in front of the public song pages and injects per-song <title>,
 * meta, OpenGraph/Twitter and JSON-LD into the static shell — without changing
 * how the SPA behaves for real users.
 *
 * Routes (configure in wrangler.toml / Cloudflare dashboard):
 *   - <site>/p/*                                  → inject per-song meta
 *   - <site>/{convert,tools,compare,guides}/*     → inject landing meta + body
 *   - <site>/sitemap.xml, <site>/robots.txt       → proxy the API
 *
 * Everything else never reaches the worker and is served straight from Render.
 */

export interface Env {
  /** Render static site origin, e.g. https://syllary-web.onrender.com */
  ORIGIN: string;
  /** API base URL, e.g. https://api.syllary.com */
  API: string;
}

/** Section prefixes the programmatic landing pages live under. */
const LANDING_PREFIXES = ["convert", "tools", "compare", "guides"];

const CATEGORY_LABEL: Record<string, string> = {
  convert: "Converter",
  tools: "Tool",
  compare: "Comparison",
  guides: "Guide",
};

type LandingBlock =
  | { kind: "steps"; items: { title: string; text?: string }[] }
  | { kind: "definition"; term: string; text: string }
  | { kind: string };

type LandingPage = {
  slug: string;
  category: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string | null;
  canonicalUrl: string | null;
  noindex: boolean;
  blocks: LandingBlock[];
  faq: { q: string; a: string }[] | null;
  renderedHtml: string | null;
};

type PublicSong = {
  title: string;
  artist: string | null;
  album: string | null;
  durationSeconds: number | null;
  coverUrl: string | null;
  language: string | null;
  createdAt: string;
};

class SetText {
  constructor(private readonly text: string) {}
  element(el: Element) {
    el.setInnerContent(this.text);
  }
}

class SetAttr {
  constructor(
    private readonly attr: string,
    private readonly value: string,
  ) {}
  element(el: Element) {
    el.setAttribute(this.attr, this.value);
  }
}

class AppendHead {
  constructor(private readonly html: string) {}
  element(el: Element) {
    el.append(this.html, { html: true });
  }
}

class SetInner {
  constructor(private readonly html: string) {}
  element(el: Element) {
    el.setInnerContent(this.html, { html: true });
  }
}

function cleanTitle(title: string): string {
  const stripped = title.replace(/\s*\d+$/, "").trim();
  return stripped || title;
}

function durationIso(seconds: number | null): string | undefined {
  if (seconds == null) return undefined;
  return `PT${Math.floor(seconds / 60)}M${Math.floor(seconds % 60)}S`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/sitemap.xml") {
      const res = await fetch(`${env.API}/sitemap.xml`, { cf: { cacheTtl: 300 } });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "application/xml; charset=utf-8" },
      });
    }

    if (url.pathname === "/robots.txt") {
      const res = await fetch(`${env.API}/robots.txt`, { cf: { cacheTtl: 3600 } });
      return new Response(res.body, {
        status: res.status,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const songMatch = url.pathname.match(/^\/p\/([0-9a-fA-F-]{36})\/?$/);
    if (songMatch && request.method === "GET") {
      return injectSongMeta(songMatch[1]!, url, env, request);
    }

    const slug = url.pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    const first = slug.split("/")[0] ?? "";
    if (LANDING_PREFIXES.includes(first) && request.method === "GET") {
      return injectLandingPage(slug, url, env, request);
    }

    // Anything else: pass through to the origin unchanged.
    return fetch(`${env.ORIGIN}${url.pathname}${url.search}`, request);
  },
};

async function injectLandingPage(slug: string, url: URL, env: Env, request: Request): Promise<Response> {
  const [shellRes, dataRes] = await Promise.all([
    fetch(`${env.ORIGIN}/index.html`, { cf: { cacheTtl: 300 } }),
    fetch(`${env.API}/api/landing/${slug}`, { cf: { cacheTtl: 120 } }),
  ]);

  if (!shellRes.ok) return fetch(`${env.ORIGIN}${url.pathname}`, request);

  const htmlResponse = new Response(shellRes.body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  // Not found / draft: serve the SPA shell untouched (it renders its own state).
  if (!dataRes.ok) return htmlResponse;

  const page = (await dataRes.json()) as LandingPage;
  const site = url.origin;
  const canonical = page.canonicalUrl ?? `${site}/${page.slug}`;
  const image = page.ogImageUrl ?? `${site}/og-default.png`;

  const blocks = page.blocks ?? [];
  const stepsBlock = blocks.find((b) => b.kind === "steps") as
    | { kind: "steps"; items: { title: string; text?: string }[] }
    | undefined;
  const definitionBlock = blocks.find((b) => b.kind === "definition") as
    | { kind: "definition"; term: string; text: string }
    | undefined;

  let primary: Record<string, unknown>;
  if (stepsBlock) {
    primary = {
      "@type": "HowTo",
      name: page.title,
      url: canonical,
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
      url: canonical,
    };
  } else {
    primary = { "@type": "Article", headline: page.title, url: canonical };
  }
  const graph: Record<string, unknown>[] = [
    primary,
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${site}/` },
        { "@type": "ListItem", position: 2, name: CATEGORY_LABEL[page.category] ?? page.category },
        { "@type": "ListItem", position: 3, name: page.title, item: canonical },
      ],
    },
  ];
  if (definitionBlock) {
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
  const jsonLd = { "@context": "https://schema.org", "@graph": graph };
  const jsonLdHtml = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;
  const robotsHtml = page.noindex ? `<meta name="robots" content="noindex" />` : "";

  // The crawler body snapshot: React replaces #root on mount for real users.
  const bodyHtml = page.renderedHtml ?? `<h1>${page.title}</h1>`;

  let rewriter = new HTMLRewriter()
    .on("title", new SetText(page.metaTitle))
    .on('meta[name="description"]', new SetAttr("content", page.metaDescription))
    .on('meta[property="og:type"]', new SetAttr("content", "website"))
    .on('meta[property="og:title"]', new SetAttr("content", page.metaTitle))
    .on('meta[property="og:description"]', new SetAttr("content", page.metaDescription))
    .on('meta[property="og:url"]', new SetAttr("content", canonical))
    .on('meta[property="og:image"]', new SetAttr("content", image))
    .on('meta[name="twitter:title"]', new SetAttr("content", page.metaTitle))
    .on('meta[name="twitter:description"]', new SetAttr("content", page.metaDescription))
    .on('meta[name="twitter:image"]', new SetAttr("content", image))
    .on('link[rel="canonical"]', new SetAttr("href", canonical))
    .on("head", new AppendHead(jsonLdHtml + robotsHtml))
    .on("#root", new SetInner(bodyHtml));

  const transformed = rewriter.transform(htmlResponse);
  return new Response(transformed.body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=120, s-maxage=120",
    },
  });
}

async function injectSongMeta(id: string, url: URL, env: Env, request: Request): Promise<Response> {
  const [shellRes, dataRes] = await Promise.all([
    fetch(`${env.ORIGIN}/index.html`, { cf: { cacheTtl: 300 } }),
    fetch(`${env.API}/api/songs/${id}/public`, { cf: { cacheTtl: 120 } }),
  ]);

  // If we can't get the shell, fall back to a normal origin fetch.
  if (!shellRes.ok) return fetch(`${env.ORIGIN}${url.pathname}`, request);

  const htmlResponse = new Response(shellRes.body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  // Not public / not found: serve the SPA shell untouched (it renders its own
  // "not available" state) — but don't expose per-song meta.
  if (!dataRes.ok) return htmlResponse;

  const song = (await dataRes.json()) as PublicSong;
  const site = url.origin;
  const title = cleanTitle(song.title);
  const byline = song.artist ? ` by ${song.artist}` : "";
  const fullTitle = `${title}${byline} — Synced Lyrics | Syllary`;
  const description = `Listen to ${title}${byline} with word-by-word synced lyrics. Download in LRC, TTML, SRT, VTT and every format streaming platforms need.`;
  const canonical = `${site}/p/${id}`;
  const image = song.coverUrl ?? `${site}/og-default.png`;

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: title,
    url: canonical,
    ...(song.artist ? { byArtist: { "@type": "MusicGroup", name: song.artist } } : {}),
    ...(song.album ? { inAlbum: { "@type": "MusicAlbum", name: song.album } } : {}),
    ...(durationIso(song.durationSeconds) ? { duration: durationIso(song.durationSeconds) } : {}),
    ...(song.language ? { inLanguage: song.language } : {}),
    datePublished: song.createdAt.slice(0, 10),
  };
  const jsonLdHtml = `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>`;

  const transformed = new HTMLRewriter()
    .on("title", new SetText(fullTitle))
    .on('meta[name="description"]', new SetAttr("content", description))
    .on('meta[property="og:type"]', new SetAttr("content", "music.song"))
    .on('meta[property="og:title"]', new SetAttr("content", fullTitle))
    .on('meta[property="og:description"]', new SetAttr("content", description))
    .on('meta[property="og:url"]', new SetAttr("content", canonical))
    .on('meta[property="og:image"]', new SetAttr("content", image))
    .on('meta[name="twitter:title"]', new SetAttr("content", fullTitle))
    .on('meta[name="twitter:description"]', new SetAttr("content", description))
    .on('meta[name="twitter:image"]', new SetAttr("content", image))
    .on('link[rel="canonical"]', new SetAttr("href", canonical))
    .on("head", new AppendHead(jsonLdHtml))
    .transform(htmlResponse);

  return new Response(transformed.body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=120, s-maxage=120",
    },
  });
}
