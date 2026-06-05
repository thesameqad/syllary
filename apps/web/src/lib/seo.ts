import { useEffect } from "react";

type MetaTag = { attr: "name" | "property"; key: string; content: string };

export type SeoConfig = {
  title: string;
  description?: string;
  canonical?: string;
  ogType?: string;
  image?: string;
  /** When true, emits <meta name="robots" content="noindex"> for this page. */
  noindex?: boolean;
  /** schema.org JSON-LD object injected as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown>;
};

const DEFAULT_TITLE = "Syllary — synced lyric files for every platform";

function setMeta({ attr, key, content }: MetaTag) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  el.dataset.syllarySeo = "1";
  return el;
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  el.dataset.syllarySeo = "1";
  return el;
}

/**
 * Manage document <head> SEO tags (title, description, canonical, OpenGraph,
 * Twitter cards, JSON-LD) for the lifetime of a component. Tags are removed on
 * unmount so SPA navigation doesn't leak stale metadata.
 */
export function useSeo(config: SeoConfig | null) {
  useEffect(() => {
    if (!config) return;
    const created: Element[] = [];
    const track = (el: Element) => created.push(el);

    document.title = config.title;

    const desc = config.description;
    const image = config.image;
    const url = config.canonical;

    const tags: MetaTag[] = [];
    if (desc) tags.push({ attr: "name", key: "description", content: desc });
    tags.push({ attr: "property", key: "og:type", content: config.ogType ?? "website" });
    tags.push({ attr: "property", key: "og:title", content: config.title });
    if (desc) tags.push({ attr: "property", key: "og:description", content: desc });
    if (url) tags.push({ attr: "property", key: "og:url", content: url });
    if (image) tags.push({ attr: "property", key: "og:image", content: image });
    tags.push({
      attr: "name",
      key: "twitter:card",
      content: image ? "summary_large_image" : "summary",
    });
    tags.push({ attr: "name", key: "twitter:title", content: config.title });
    if (desc) tags.push({ attr: "name", key: "twitter:description", content: desc });
    if (image) tags.push({ attr: "name", key: "twitter:image", content: image });

    if (config.noindex) tags.push({ attr: "name", key: "robots", content: "noindex" });

    for (const t of tags) track(setMeta(t));
    if (url) track(setLink("canonical", url));

    let jsonLdEl: HTMLScriptElement | null = null;
    if (config.jsonLd) {
      jsonLdEl = document.createElement("script");
      jsonLdEl.type = "application/ld+json";
      jsonLdEl.textContent = JSON.stringify(config.jsonLd);
      document.head.appendChild(jsonLdEl);
    }

    return () => {
      document.title = DEFAULT_TITLE;
      for (const el of created) el.remove();
      jsonLdEl?.remove();
    };
  }, [config]);
}
