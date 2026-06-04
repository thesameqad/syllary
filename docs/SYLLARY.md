# SYLLARY — Product Knowledge

> **Master source of truth.** This file is the single canonical description of Syllary.
> It is read by Claude Code (via the repo), by Claude Cowork (when operating in the project),
> and is mirrored into the Claude Chat "Syllary" Project knowledge.
> **Update rule:** edit this file first, then paste the new version into the Chat Project knowledge.
> Anything marked `[FILL IN: ...]` still needs the founder's real details.

---

## 1. What Syllary is (one paragraph)

Syllary is a website that turns a piece of music into everything you need around its lyrics.
You upload an audio file (MP3, WAV, or FLAC) and Syllary automatically transcribes the lyrics, times them
to the audio, and lets you export them in every common lyrics-file format (.lrc, enhanced .lrc, .ttml, .srt, .vtt, .txt, .json).
From that same timed-lyrics data, Syllary can also publish a public lyrics page where other listeners can read the lyrics and listen to the song in a dynamic karaoke-style and generate a dynamic lyric video. It is built
especially for creators of AI-generated music (e.g. Suno, Udio) and for singers/managers who have the
audio but not the structured lyrics files that distribution, streaming, and karaoke require.

---

## 2. The core idea (the engine everything sits on)

The heart of Syllary is a single asset: **timed, editable lyrics** (the words plus the timestamp of
when each is sung). Everything else is just a different way of _rendering_ that one asset:

```
audio in  →  transcribed + timed + editable lyrics  →  ┌─ lyrics files (LRC, TTML, SRT, VTT, JSON)
                                                        ├─ public lyrics page (optional)
                                                        └─ dynamic lyric video / visualization
```

This is why Syllary is **one product, not three**: files, public pages, and lyric videos are three
outputs of the same engine, not separate businesses.

---

## 3. Core features

- **Automatic lyrics transcription from audio** — upload MP3, WAV, or FLAC, AI transcribes the lyrics. No need
  to paste lyrics in (important for AI-generated songs where the user never had a lyrics sheet, maximum has regular text from suno).
- **Automatic timing/synchronization** — AI aligns each lyric line (and where applicable, word) to the
  audio timeline.
- **Correction editor** — tools to quickly fix any lyrics or timing the AI got slightly wrong. _(This is
  a first-class feature, not a fallback — fast, easy correction is what makes the whole product feel
  magical. See §9 brand notes.)_
- **Multi-format export in one pass** — generates LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON from a single upload (source: `packages/lyrics` `LYRIC_FORMATS`).
- **Optional public lyrics page** — user can choose to publish their lyrics as a public page (opt-in). This should be done only for own songs. For creators who use suno, this is a way to have a public page with lyrics for others to sing it.
- **Dynamic lyric video / visualization** — generates a synced lyric video from the timed-lyrics data.
  Positioned as _lyric visualization_, lyric music videos, not full cinematic music video.
- **Organize music** - Easy to organize music into albums/artists. Easpecially useful for users who use AI, since they might have different AI artists they work on.
- **Import from Deezer** - Easy to import the whole album from Deezer. Once done, user just needs to upload music files. The rest is done automatically
- **Easy to create a beautiful lyrics page for listeners** - AI can do 99% of the hard work: recognize lyrics, sync timings, find links to spotify and other platforms, write summary of the song, generate a cover and generate a lyrics video. So, suno is used to create a audio file, we make a beautful karaoke style, lyric videos and the full of info page for it using AI

---

## 4. Supported formats (and what each is for)

- **LRC** — classic line-timestamped lyrics; the universal standard for synced lyrics in music players,
  karaoke software, and Spotify local files.
- **LRC-enhanced** - enchanced version of LRC
- **TTML** — the timed-text format Apple Music uses for synced lyrics.
- **SRT** — standard subtitle format; for video subtitles / captions.
- **VTT (WebVTT)** — web-native subtitle/caption format for HTML5 video.
- **JSON** — structured/machine-readable timed-lyrics data; for developers and downstream apps.
- **TXT** - just a simple text representation

---

## 5. Who it's for (target users)

Launch audience is **not yet locked** — to be discovered by market testing. Two main candidate groups:

1. **AI-music creators** publishing their _own / AI-generated_ original songs (Suno, Udio, etc.) who never
   had a lyrics sheet because the song was auto-generated. **Cleanest legally** (they own/created the work).
2. **Singers / managers** who have already-recorded audio (MP3/WAV) but lack the structured lyrics files
   distribution and streaming platforms require.

Secondary users that show up in the data: content creators (TikTok/YouTube captions), karaoke makers,
podcasters needing timed transcripts, developers (via API/JSON).

## 6. How it works (user flow)

1. User uploads an audio file (MP3 / WAV / FLAC).
2. Syllary auto-transcribes the lyrics and times them to the audio.
3. User reviews and, if needed, corrects lyrics/timings in the editor (quick).
4. User exports the formats they need (LRC / TTML / SRT / VTT / JSON).
5. Optionally: publish a public lyrics page, and/or generate a lyric video.

---

## 7. Pricing & free tier

**Confirmed from code** (`apps/web/src/lib/plans.ts`, `packages/shared/src/account.ts`
`PLAN_CREDITS`, `packages/shared/src/constants.ts`). Everything runs on **one token wallet** —
a single balance spent on lyrics transcription, AI covers, and lyric videos. **The only
per-plan difference enforced in code is the monthly token grant**; every paid plan gets all
three generation modes, all export formats, inline editing, public sharing, and the embed
widget. (So the older "paid gates power features" framing is not how it's actually built.)

**Free**

- **Signed up:** **1,000 tokens granted once** on signup (`FREE_CREDITS`); library capped at
  **3 songs** (`FREE_SONG_LIMIT`); full-length tracks; all downloads.
- **Anonymous (no signup):** **1 free song** total per IP+UA hash (`ANONYMOUS_DAILY_LIMIT`);
  **3-minute cap** (`MAX_DURATION_SECONDS = 180`); downloading requires signing in.

**Lyrics plans** (cheap, modest grants):

| Plan                 | Monthly | Annual | Tokens / mo |
| -------------------- | ------- | ------ | ----------- |
| Starter              | $6      | $48    | 5,000       |
| Creator _(featured)_ | $14     | $120   | 15,000      |
| Pro                  | $29     | $240   | 60,000      |

**Music-video plans** (large grants for video-heavy users):

| Plan                | Monthly | Annual | Tokens / mo | ≈ videos |
| ------------------- | ------- | ------ | ----------- | -------- |
| Reel                | $39     | $390   | 80,000      | 2–3      |
| Studio _(featured)_ | $99     | $990   | 220,000     | 5–9      |
| Premiere            | $199    | $1,990 | 620,000     | 20–36    |

What a token buys: a song's lyrics ≈ **100 tokens for the first minute + 50/min**, × mode
multiplier (Fast ×1, Normal ×1.5, Pro ×2); an **AI cover = 20 tokens** (Standard / fal FLUX)
or **430** (Premium / Nano Banana); a **lyric video** is priced per scene + length
(`estimateVideoCost`). Money is handled in Stripe (cents); the lyrics-plan prices are created
by `apps/api/src/scripts/setup-stripe.ts`.

**Brand credit, not a hard watermark (current reality):** public pages (`/p/:id`) and the
result page show a "Made with Syllary" credit link, and lyric-video **previews** carry a big
"PREVIEW" overlay — but there is **no watermark baked into exported files or finished videos**
yet. If a free-tier output watermark is wanted for the distribution loop, it still needs building.

---

## 8. Positioning — why Syllary wins

**Central wedge:** Syllary is the only tool where a single audio upload becomes _all_ the lyrics formats
**plus** an editor to fix AI mistakes **plus** a public page **plus** a lyric video — all from one timed-lyrics
engine. Competitors typically do just one slice (LRC only, or video only, or hosted lyrics only).

Recurring advantages to lean on (verify each against the live product before making the claim publicly):

- **All formats from one upload**, not LRC-first with others bolted on.
- **Correction editor** for fixing auto-transcription — many competitors are paste-and-pray or manual-sync.
- **Built for your own / AI-generated songs** — no dependency on a licensed commercial catalog.
- **Multiple outputs** (files + public page + video) from one project, not separate tools.
- **Browser-based, no install**, automatic transcription (no manual lyric entry required).
- **Create Lyric Videos easy** since we already have all the tools needed to make perfect synced lyrics, it's so much easier to convert it into lyric video, unlike tools like OpenArt or higgsfield that are tailored towards generic video creation and don't have tools for lyrics sync

Competitor landscape (for comparison/SEO pages):

- _LRC/synced-file generators:_ QuickLRC, AI LRC Generator (ailrcgenerator.com), Karadeo, LRC Creator,
  LyricSync, Musixmatch, desktop LRC tools.
- _Lyric-video makers:_ Rotor, Neural Frames, Kaiber, Specterr, Steve.AI, VEED, Kapwing, FlexClip,
  Freebeat, TopMediai, EchoWave, Animaker.
- _Online lyrics platforms:_ Genius, AZLyrics, Lyrics.com, LyricFind, Spotify/Apple Music synced lyrics.

---

## 9. Brand voice & content notes

- Frame lyric videos as **"visualization,"** not "music videos" — sets correct expectations and sidesteps
  competing with cinematic AI-video tools.
- The **correction editor is a hero feature**, not an apology for imperfect AI. Speak about it positively.
- Tone: friendly
- **Name / logo:** "Syllary"; the logo is a wordmark (`apps/web/src/components/logo` `LogoWordmark`).
- **Colors** (CSS variables in `apps/web/src/index.css` — never hardcoded): Pulse `#FF2D2D`
  (primary CTA on dark), Ember `#D81818` (red on light), Void `#0A0A0A` (dark background),
  Stage `#161616` (surface), Paper `#FAFAF7` (light background), Mute `#888888`, Success `#4ADE80`.
  Dark theme is the default (landing / player / dashboard); the light "Paper" theme is for
  auth / billing / account.
- **Type:** Inter (variable, self-hosted via Fontsource — not the Google CDN); JetBrains Mono
  for file-format / code labels only.
- **In-product copy** (the closest thing to taglines, from the landing page): "Synced lyric files
  in every format — for shipping releases to the platforms," "Platform-ready," "Get my lyric files."
  No single locked tagline exists in code.

---

## 10. Copyright boundaries — IMPORTANT (read before any content/marketing)

These are hard rules that protect the whole project. They apply to product copy, SEO pages, and any
Cowork-generated content.

- **Public pages and any hosted lyrics are for the user's OWN or AI-generated songs only.** Publishing is
  **opt-in**, with the user affirming they own or have rights to the lyrics.
- **Never host, generate, or build SEO pages around commercial/popular-artist lyrics** (e.g. Taylor Swift
  lyrics pages). That is the unlicensed-lyrics wall Genius/Musixmatch sit behind via publisher/PRO deals,
  and it is the single most likely thing to draw takedowns and sink the site.
- **SEO strategy ranks for TASKS and TOOLS** ("how to make an LRC file", "LRC for Suno"), **never for
  copyrighted lyrics content.**
- **Do NOT attach the Syllary brand to AI covers of commercial songs.** AI covers of popular music ride
  copyrighted compositions (and often cloned voices) — branding them is signing a confession on the most
  legally contested content in music. Own/original AI songs only.

---

## 11. Marketing / growth strategy (summary — see full strategy doc/chat for detail)

Two allowed buckets only (founder has no time for manual community/forum work):

1. **Paid, automatic:** start with **Google Search ads** only (highest intent), measure cost-per-paying-user,
   expand to Meta/TikTok _for videos_ only if outputs convert. Skip Spotify ads & AdSense.
2. **Set-up-once automated routines (Cowork):** programmatic landing pages on Syllary's own domain
   (comparison pages, how-to/task pages, mini-tool pages, Suno-downstream pages), embeddable lyrics widget,
   output watermark loop, API + npm/PyPI package, MCP connector, AI-assistant-recommendation content,
   affiliate outreach to AI-tool YouTubers.

**SEO build plan:** ~150–200 genuinely distinct landing pages at launch (NOT thousands — new domains get
penalized for dumping near-duplicate pages), then a Cowork scheduler adds 10–30 _quality, distinct_ pages
per week. Pages are dynamic (one template + Supabase rows + auto-generated sitemap submitted to Google
Search Console). **Each page must be genuinely useful and distinct** — near-duplicate pages get ignored
or penalized.

---

## 12. Tech notes (for Code / Cowork)

- App was built with Claude Code. **Stack (confirmed from the code — this supersedes any older
  "locked stack" notes):**
  - **Frontend:** Vite + React 18 + TypeScript + Tailwind (v4) + shadcn-style UI; Framer Motion +
    GSAP + React Three Fiber/drei for motion; wavesurfer.js for the waveform.
  - **Backend:** Node 22 + Fastify + TypeScript.
  - **DB:** Postgres on **Supabase** + Drizzle ORM (migrations in `apps/api/drizzle`, applied via
    `db:migrate` in the Render pre-deploy step).
  - **Auth:** **Clerk** (not Better-Auth). **Payments:** Stripe (checkout + portal + webhooks).
    **Storage:** Cloudflare R2 (direct presigned uploads). **Email:** Resend.
  - **Transcription:** Replicate **Demucs** (vocal isolation) → fal.ai **ElevenLabs Scribe v2**
    (speech-to-text). _(WhisperX is deprecated.)_
  - **LLM:** OpenRouter → Gemini 2.5 Flash (lyric cleanup, section labels, song summary, video art brief).
  - **Image gen:** fal.ai **FLUX schnell** (album/artist/song covers) + OpenRouter "Nano Banana"
    (Gemini 3 Pro / 3.1 Flash Image) for lyric-video backdrops. **Video:** bundled `ffmpeg-static`
    for motion/stitch; OpenRouter Grok / Seedance for the AI-motion video styles.
  - **Catalog / links:** iTunes Search + **Odesli** (auto-find streaming links), **Deezer** (album/artist
    import — keyless); Spotify optional (Premium-gated, currently off).
  - **Hosting:** Render — Fastify API (web service) + Vite static site (`infra/render.yaml`).
    **Analytics:** Plausible (self-hosted, separate stack).
  - **Monorepo:** pnpm workspaces.
- Data layer: **Supabase** (connected). Landing-page system plan: a Supabase table (one row per page) +
  a dynamic catch-all route rendering a template from each row + an auto-generated sitemap.xml.
- **Domain:** frontend at **syllary.com**, API at **api.syllary.com** (per `infra/render.yaml` — set as
  `APP_URL` / `VITE_API_URL`). Programmatic SEO landing pages are planned on the same domain.
- **Repo:** GitHub `thesameqad/syllary` (monorepo). Key dirs: `apps/web` (frontend), `apps/api` (Fastify
  backend — `src/routes`, `src/lib`, `src/db` + `drizzle` migrations, `src/scripts`),
  `packages/shared` (Zod types/schemas — single source of truth for both apps), `packages/lyrics`
  (the format generators), `infra/render.yaml` (deploy blueprint).

---

_Last updated: 2026-06-04. Keep this date current when editing._
