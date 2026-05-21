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

syllary/
├── apps/
│ ├── web/ Vite + React frontend
│ └── api/ Fastify backend
├── packages/
│ ├── shared/ Types, Zod schemas shared between web + api
│ └── lyrics/ Format generators: lrc, ttml, srt, vtt, txt, json
├── infra/
│ └── render.yaml Render blueprint for one-click deploys
└── CLAUDE.md

## Design system

- Primary red: #FF2D2D (Pulse) — interactive elements on dark
- Deep red: #D81818 (Ember) — red on light backgrounds, favicons
- Background: #0A0A0A (Void) — landing, player, dashboard
- Surface: #161616 (Stage) — cards on dark
- Light bg: #FAFAF7 (Paper) — auth, billing, account
- Mute gray: #888888
- Font: Inter, weights 400 + 500 only. Tight tracking on headlines (-2px to -2.8px).
- All UI uses CSS variables so dark/light flip is a one-line change.

## Skills in use

- gpt-taste — landing page ONLY (strict GSAP, Awwwards-tier)
- taste-skill — non-landing pages, settings DESIGN_VARIANCE:6 MOTION_INTENSITY:7 VISUAL_DENSITY:4
- minimalist-skill — dashboard, player, account UI (Linear-clean)
- output-skill — always on. No TODO placeholders. No half-finished code.

## Pricing tiers

- Free (anonymous): 1 song/day, 60-sec cap, watermarked share, no download
- Free (signed up): 3 songs total lifetime, full length, all downloads
- Starter: $6/mo or $48/yr — 30 songs/month
- Creator: $14/mo or $120/yr — 100 songs/month + bulk + priority queue + embed widget
- Pro: $29/mo or $240/yr — 400 songs/month + API + early MP4 access

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
