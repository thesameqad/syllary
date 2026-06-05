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

## 7. Lyric-video types — the visualization ladder (INTERNAL UNDERSTANDING)

Why this section exists: "Lyric video" means wildly different things across tools, and competitors collapse the distinction on purpose (they call flat text-on-a-background a "lyric video" too). This ladder is how we think about it internally and how we bucket competitors. It is the backbone of the lyric-video comparison pages.
NAMING / MARKETING RULE: The model and vendor names below (WAN, Nano Banana, FLUX, ffmpeg, Seedance, Grok, etc.) are for our internal understanding only. They must NEVER appear on the landing pages, comparison pages, or any marketing material. On the landing pages we describe the experience and the visible difference in plain language — "the words are part of the scene," "the scene moves," "one continuous shot" — never the pipeline. Treat the tech names like a trade secret in copy.

The ladder, simplest → most advanced:
Type 1 — Text on a background (overlay).
Plain text rendered over a static or lightly-animated background, highlighting line-by-line, scrolling, or word-by-word. The text is a flat overlay sitting on top of the picture; the background and the words are unrelated layers. Technically this is an ffmpeg text-burn job. The line/scroll/word variants are cosmetic — it's all the same category.

Plain-language description for copy: "lyrics typed over a background."
This is the ceiling for most competitors (see bucketing note).

Type 2 — Slideshow with the words inside the scene (Syllary's simplest visual mode).
A sequence of generated images where the text is part of the image itself, not an overlay. If the scene is a fire, the words are written in the fire; if it's a steamy shower glass, the words look steamed onto the glass. The lyrics belong to the world of the picture.

Internal tech: generated stills (fal.ai FLUX / OpenRouter "Nano Banana"), with the lyric composited into the scene rather than burned on top.
Plain-language description for copy: "the words are part of the scene, not stuck on top of it."

Type 3 — Living scenes (Syllary).
Type 2, but the scenes move. The still images are animated: leaves rustle, a car drives, rain falls, light flickers. Still delivered as a sequence of distinct scenes, each one alive.

Internal tech: WAN (open-source image-to-video model, github.com/Wan-Video/Wan2.2) applied on top of the generated stills to bring them to motion.
Plain-language description for copy: "the scenes come alive and move with the song."

Type 4 — Cinematic (Syllary, EARLY BETA — mention lightly).
Like living scenes, but rendered as one continuous shot instead of a set of separate animated scenes — a single flowing video rather than a slideshow of moving clips. Lyrics are still the focus; this is not a narrative film.

Internal tech: AI-motion video pipeline (OpenRouter Grok / Seedance styles) for continuous generation.
Status: experimental / early beta. We can mention it exists, but do not over-promise or lead with it yet.
Plain-language description for copy: "one continuous, flowing video — still all about the words."

Type 5 — Real music video (Syllary does NOT do this).
Singers performing, characters, a plot — an actual narrative or performance film, the kind tools like OpenArt attempt. We deliberately don't do this. There is no story and no performer; we render what is being sung, visualized. State this plainly when asked so expectations are correct (ties to the §9 "visualization, not music video" rule).
Competitor-bucketing note (for comparison pages)

QuickLRC / Karadeo (same founder), and essentially every "lyric video maker" in the landscape (Specterr, Rotor, EchoWave, the CapCut/Kapwing route, etc.) top out at Type 1 — text over a background, however nicely highlighted. Their karaoke/lyric "videos" are overlays.
Syllary's distinguishing range is Types 2–4, where the words live inside generated, often moving scenes. This is the honest, defensible difference — not "we make lyric videos and they don't," but "everyone's lyric video is words-on-a-background; ours puts the words inside a living scene."
Nobody should claim Type 5. If a competitor markets "AI music videos with a story" (e.g. OpenArt), that's a different product and a different (messier) copyright posture — we don't compete there and don't want to.

The public page renders multiple outputs at once (reinforces the one-engine wedge)
The public lyrics page (/p/:id) is not just a lyrics reader — on a single page it shows: the dynamic synced lyrics player (Type-1-style reader, with a clickable song-structure bar to jump verse/chorus/etc. and a Dynamic vs Full view toggle), the lyric video (a Type 2–4 scene, with a Theater view), all file downloads (.lrc/.srt/.txt + "More formats" + "Download all"), Share + Embed, and streaming links (Spotify, etc.). This is the strongest single proof of "one engine, many outputs" — the page literally displays them side by side. Lead public-page comparisons with this, not with "we have a public page."

## 8. Pricing & free tier

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

## 9. Positioning — why Syllary wins

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

Two formats competitors (notably QuickLRC/Karadeo) export that we currently do not — documented so comparison copy is accurate and so we have a clear rationale if asked.

- .ass (Advanced SubStation Alpha) — a heavily-styled video subtitle format from the anime-fansub world (native to the Aegisub editor). Unlike SRT/VTT, ASS controls font, color, outline, shadow, exact on-screen position, and has built-in karaoke timing tags (\k) for syllable-by-syllable fill/highlight. It exists to make styled karaoke text that gets burned into a video overlay (Type-1 lyric videos). Why we don't support it: our karaoke styling lives inside our own player and our scene-based videos (Types 2–4), so we don't need ASS to deliver a good karaoke experience; it's a video-overlay format, not something streaming/distribution wants. Status: low-priority, feature-parity / SEO only. Could add an "LRC ↔ ASS" path later purely for parity if comparison/SEO pressure justifies it.
- .pdf — not a synced format at all. A lyrics PDF is just the words laid out as a clean, printable lyric sheet (no timestamps). Real uses: physical liner notes / album inserts, printing to rehearse or hand to a session singer/choir, attaching a lyric sheet to a sync-licensing or publishing contact, or copyright-registration paperwork. It's the "human reads it on paper" output — the opposite end from LRC/TTML (machine-read). Why we don't support it: it's outside the distribution wedge, and our existing .txt export already covers most plain-lyrics needs (PDF would just be "TXT but formatted and printable"). Status: low-priority; one "printable lyric sheet (PDF)" output has genuine search intent and could be added if/when we want it — ASS does not have the same standalone intent.

One-line rule for comparison pages: ASS = styled karaoke video subtitle; PDF = plain printable lyric sheet. Neither is core to distribution (LRC/TTML/SRT/VTT/JSON cover the platforms), so their absence is a deliberate scope choice, not a gap — don't let comparison copy imply we're "missing" a distribution format.

---

## 10. Brand voice & content notes

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

## 11. Copyright boundaries — IMPORTANT (read before any content/marketing)

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

## 12. Marketing / growth strategy (summary — see full strategy doc/chat for detail)

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

# 13. Mini-tools (standalone free tools off the same engine)

Each mini-tool is a small, single-purpose tool at its own URL that does one job free, then funnels to the full engine ("want the synced files / video / public page? →"). Each is its own search entry point and top-of-funnel surface (see §11 growth strategy). They reuse existing components (wavesurfer waveform, the correction editor, the packages/lyrics export generators, the public-page reader) wherever possible.
Cost: tools that call transcription, the LLM, image gen, or video are token-metered exactly like the main app (§7). Pure client-side tools cost nothing to run and make the best free SEO bait. Publishing/karaoke tools carry the own/AI-songs-only opt-in (§10).
The tools are grouped by build effort.
13a. Already in the engine — just expose as a standalone tool (cheapest)
Reuse capabilities Syllary already has (§3 / §12). Work is mostly UI extraction + a dedicated route, not new core tech.

Audio-to-text transcriber — Demucs → ElevenLabs Scribe pipeline; upload → transcript out (no timing/export step). Token-metered.
SRT generator from audio — same pipeline, output limited to .srt (LYRIC_FORMATS).
VTT caption generator — same pipeline, output limited to .vtt.
Karaoke file maker — transcription + word-level timing → enhanced LRC / karaoke page. Own/AI songs only.
LRC editor (online) — the existing correction editor + wavesurfer; allow paste/upload of an existing .lrc to edit, not just freshly-generated. Live preview already exists.
Lyric timestamp viewer — wavesurfer waveform + timed-lyrics render; read-only view of timestamps against the waveform.
Waveform viewer for lyrics timing — wavesurfer.js. Overlaps the timestamp viewer — merge or sharpen the distinction before shipping two near-duplicate pages (§11 near-duplicate risk).
Time-synced lyrics preview player — reuse the public-page (/p/:id) Type-1 reader component; paste LRC + audio → karaoke preview.
Universal lyrics format converter — packages/lyrics LYRIC_FORMATS generators; parse any supported in-format → re-emit any out-format. Exclude .ass/.pdf (not supported, §4) and no JSON-as-input (converter-realism rule, see §4 / landing-page brief).
Song summary generator — OpenRouter → Gemini 2.5 Flash; already generated for the public page, expose standalone. Token-metered.
Album/song cover generator — fal.ai FLUX (standard, 20 tokens) / Nano Banana (premium, 430); already generated for albums/artists/songs, expose standalone.
Streaming link finder — iTunes Search + Odesli (keyless Deezer); paste/identify song → fetch streaming links.
Find the chorus — derived from the auto section-labeling (Gemini 2.5 Flash) already produced; a focused view of existing labels.

13b. Pure client-side — net-new but cheap (no server/AI cost)
String/format/math utilities that run entirely in the browser. Zero token cost, strong free SEO bait, small build each.

LRC validator/checker — parse a pasted/uploaded .lrc; flag malformed/out-of-order timestamps, missing tags, and encoding issues (GB2312/GBK vs UTF-8 is a known LRC pitfall). No audio needed.
LRC offset adjuster — add/subtract a fixed offset (ms) to every timestamp, or set the [offset:] tag. Explain positive vs negative (text shows sooner/later).
Plain lyrics extractor — strip all timing/markup from LRC/TTML/SRT/VTT → clean plain text. This is also the engine behind the printable lyric-sheet page — build once, surface twice.
Lyrics word counter — count words, lines, unique words from pasted lyrics or an uploaded file. Lowest-effort tool in the set.

13c. Net-new audio analysis (real DSP — build only if wanted)
Do not exist in the engine today; require actual audio signal processing. Nice top-of-funnel but tangential to the distribution wedge — decide build vs. defer per tool.

BPM detector — tempo estimation via Web Audio API + onset/autocorrelation, or a small server step. No transcription needed. Net-new.
Song key finder — chroma / pitch-class key profiling (Krumhansl-style) on decoded audio. Net-new, heavier than BPM.
Song duration / lead-in silence detector — duration is trivial (decode metadata); lead-in silence = amplitude-threshold scan. Ties to the offset concept. Mostly client-side and cheap — fine to just do.

13d. Build order

13a first — highest leverage; reuses what's built and directly showcases the engine.
13b next — cheap client-side utilities, no cost.
13c last / optional — BPM and key finder are the only items needing new DSP; duration/silence is cheap anytime.

## 14. Tech notes (for Code / Cowork)

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
