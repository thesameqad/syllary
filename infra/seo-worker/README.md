# Syllary SEO worker

A small Cloudflare Worker that makes the static SPA's **public song pages**
crawlable and shareable. It injects per-song `<title>`, meta description,
OpenGraph/Twitter tags and `MusicRecording` JSON-LD into the static HTML shell
for `/p/:id`, and serves `/sitemap.xml`. Real users still get the normal SPA.

Why it's needed: the frontend is a Vite static site, so its `<head>` is the same
for every route until JS runs. Googlebot executes JS (eventually), but most
link-unfurlers (Slack, Twitter/X, Facebook, LinkedIn) and many crawlers do not —
they would otherwise see the generic default tags. This worker fixes that.

## How it works

- `GET <site>/p/:id` → fetches the static shell from Render **and** the song
  from `GET <api>/api/songs/:id/public`, then rewrites the head tags + appends
  JSON-LD with `HTMLRewriter`. Non-public/unknown ids fall back to the plain
  shell.
- `GET <site>/sitemap.xml` → proxies `GET <api>/sitemap.xml`.
- Everything else bypasses the worker (served from Render via Cloudflare).

## Deploy

Prereq: the domain's DNS is on Cloudflare and the site is reachable.

```bash
cd infra/seo-worker
npm i -g wrangler        # or: pnpm dlx wrangler
# Edit wrangler.toml: set ORIGIN (Render static URL), API (public API URL),
# and the route patterns/zone_name to your domain.
wrangler deploy
```

After deploy, verify:

```bash
curl -s https://syllary.com/p/<public-song-id> | grep -i '<title>'
curl -s https://syllary.com/sitemap.xml | head
```

You should see the song-specific `<title>` and a valid XML sitemap.

## Notes

- Responses are cached briefly (`max-age=120`) so repeated crawls are cheap; the
  shell and API responses use Cloudflare edge caching too.
- If you skip the worker, the app still works for users — only non-JS crawlers
  miss the per-song meta, and `<site>/sitemap.xml` won't resolve (point Search
  Console at `<api>/sitemap.xml` instead in that case).
