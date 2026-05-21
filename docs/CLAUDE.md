# Syllary — Project Context

## What this is
Syllary turns an MP3/WAV/FLAC upload into every synced-lyrics file format a
musician needs to ship to streaming platforms (Spotify, Apple Music, YouTube
Music, etc.) via any distributor. Output formats: .lrc, enhanced .lrc,
.ttml, .srt, .vtt, .txt, .json.

## Target user
Independent musicians shipping releases via DistroKid, CD Baby, TuneCore,
Amuse, or similar. They need platform-validated lyric files and don't want
to learn 7 file formats.

## Wedge / positioning
"Upload your track. Get every lyric file the platforms need — validated and
ready to ship." We never name a specific distributor in marketing copy.

## Design system reference
Visual reference and motion spec live in `docs/design/`:
- `docs/design/landing-reference.html` — open in browser to see the static visual target
- `docs/design/DESIGN-SPEC.md` — motion, 3D scene, scroll choreography, perf budget
- `docs/design/logo-variants.svg` — all logo variants
- `apps/web/public/hero-bg.mp4` — AI-generated hero video (must be created separately)

## Stack (locked)
- Frontend: Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- Animation: Framer Motion + GSAP (with ScrollTrigger) + React Three Fiber + drei
- Waveform: wavesurfer.js
- Backend: Node.js 22 + Fastify + TypeScript
- DB: Postgres (Render Basic-256mb) + Drizzle ORM
- Auth: Better-Auth (open source, no Auth0)
- Payments: Stripe (checkout + customer portal + webhooks)
- Email: Resend
- File storage: Cloudflare R2 (S3-compatible, zero egress fees)
- Transcription: Replicate `victor-upmeet/whisperx` (~$0.007/song)
- LLM cleanup + section labels: OpenRouter → Gemini 2.5 Flash
- Hosting: Render (web service for API, static site for frontend)
- Analytics: Plausible self-hosted on Render
- Monorepo: pnpm workspaces

## Repo structure
```
syllary/
├── apps/
│   ├── web/          Vite + React frontend
│   └── api/          Fastify backend
├── packages/
│   ├── shared/       Types, Zod schemas shared between web + api
│   └── lyrics/       Format generators: lrc, ttml, srt, vtt, txt, json
├── infra/
│   └── render.yaml   Render blueprint for one-click deploys
├── docs/
│   └── design/       Design reference files
└── CLAUDE.md
```

## Color palette (use CSS variables, NEVER hardcode)
- Pulse `#FF2D2D` — primary CTA on dark
- Ember `#D81818` — red on light backgrounds
- Void `#0A0A0A` — landing/player background
- Stage `#161616` — surface on dark
- Paper `#FAFAF7` — light-mode background (auth, billing)
- Mute `#888888`
- Success `#4ADE80`

## Typography
- Font: Inter (variable, self-hosted via Fontsource — never Google Fonts CDN)
- Two weights only: 400 + 500
- Hero h1: 68/500/-2.8px
- Section h2: 36/500/-1.2px
- Body large: 19/400/1.5
- Mono: JetBrains Mono for file formats/code only
- Sentence case always. Never Title Case, never ALL CAPS (except 11px eyebrow labels with letter-spacing)

## Skills in use
- gpt-taste — landing page ONLY (strict GSAP, Awwwards-tier)
- taste-skill — auth and transactional surfaces, settings DESIGN_VARIANCE:6 MOTION_INTENSITY:4 VISUAL_DENSITY:4
- minimalist-skill — dashboard, player, settings, billing (Linear-clean)
- output-skill — always on. No TODO placeholders. No half-finished code.

## Pricing tiers
- Free (anonymous): 1 song/day, 60-sec cap, watermarked share, no download
- Free (signed up): 3 songs total lifetime, full length, all downloads
- Starter: $6/mo or $48/yr — 30 songs/month
- Creator: $14/mo or $120/yr — 100 songs/month + bulk + priority queue + embed widget
- Pro: $29/mo or $240/yr — 400 songs/month + API + early MP4 access

## Stripe catalog (created via Stripe MCP, NOT hardcoded in app)
3 products × 2 prices each = 6 prices total. Each price has metadata:
- `tier`: "starter" | "creator" | "pro"
- `billing_period`: "monthly" | "annual"
- `monthly_song_quota`: 30 | 100 | 400

App reads quota from Stripe price metadata, never from constants.

No free trials in v1. The 3-songs-on-signup free tier serves the trial role.

## Non-negotiable rules for code
1. Every Stripe webhook handler is idempotent (check event.id against a
   processed_events table before mutating state).
2. Free-tier quota is checked SERVER-SIDE before any Replicate call.
   Never trust the client.
3. Anonymous users are tracked by IP+UA hash, not cookies, for the 1/day limit.
4. Audio uploads go directly to R2 via presigned URLs. Never proxy through API.
5. All money in cents (integer), never floats.
6. All times in UTC, stored as `timestamptz`.
7. Zod schemas in packages/shared are the single source of truth for types.
8. No `any` in TypeScript. Ever.
9. Replicate calls have a 5-min timeout and one automatic retry on transient errors.
10. No localStorage for anything user-data sensitive. Sessions only.
11. `prefers-reduced-motion: reduce` is respected on every animation. Not optional.

## Marketing automation (must be built into product, not external)
- Watermarked public share URL: /s/{songId} — required for free tier results
- Embeddable iframe widget: /embed/{songId} — Creator+ tier only
- Referral credits: built into user settings, +5 free songs both sides
- 5-email onboarding drip via Resend (signup → tutorial → first export → upgrade prompt)
- Programmatic SEO landing pages for format converters (lrc-to-ttml, etc.)
- Affiliate program via Rewardful (20% recurring)

## Out of scope for v1 (don't build, don't suggest)
- MP4 lyric video export
- Mobile app
- Team / multi-seat accounts
- API access for users (Pro tier shows it as "coming soon")
- Spotify/Apple Music direct integration
- Real-time collaborative editing

## Performance budget for landing page
- FCP < 1.5s, LCP < 2.5s, TBT < 300ms
- Lighthouse Performance > 90
- Total JS sent gzipped (excl hero video) < 250KB
- Three.js dynamically imported, never on initial bundle
- Hero video lazy-loaded, never blocks render
