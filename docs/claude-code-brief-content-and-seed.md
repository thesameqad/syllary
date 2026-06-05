# Claude Code Brief — Write & Seed the 152 Syllary Landing Pages (content + DB)

> **Paste this whole brief to Claude Code, working in the `thesameqad/syllary` repo.** The landing-page system, templates, mini-tool framework, and `landing_pages` schema already exist. This task is **content generation + seeding**: produce 152 genuinely distinct, accurate, SEO-strong landing-page rows and insert them via an idempotent seed script. This is a one-time job, not a routine.

---

## 0. Read before writing (do not skip)

1. `docs/SYLLARY.md` — master product doc. Source of truth for stack, positioning, copyright rules, formats, pricing, brand voice. **If a claim isn't supported here or verifiable, don't write it.**
2. `docs/syllary-150-landing-pages.md` — the per-page topic briefs (#1–160) with the exact angle for each page, the ⚠️ honest-comparison flags, the converter-realism rules, and the mini-tool build status.
3. **The real Zod schema in `packages/shared`** for `landing_pages` `content` (the discriminated union on `type`). **Use the actual field names from the code, not any field names implied by this brief or the topic-brief doc.** If they differ, the code wins. Read it before generating anything.
4. The existing seed-script pattern in `apps/api/src/scripts` (e.g. how `setup-stripe.ts` / any existing seeder is structured, how DB access works via Drizzle). Reuse that pattern.

If anything in steps 1–4 is missing or contradictory, **stop and report** rather than guessing.

---

## 1. What to produce

**152 published `landing_pages` rows**, by bucket:

| Bucket | `type` | Count | Source rows |
|---|---|---|---|
| Comparison / "vs" | `comparison` | 30 | #1–30 |
| How-to / Task | `how_to` | 50 | #31–90 |
| Format & "What is" | `format` | 20 | #91–110 |
| Mini-tool | `mini` | 12 | only the ✅-live tools (keys below) |
| AI-music / Downstream | `ai_music` | 30 | #131–150 |
| Added | mixed | 10 | #151–160 (each row's `type` is given in the doc) |

**Live `tool_key`s — the ONLY keys a `mini` row may use:** `lrc-editor` (#112), `lrc-validator` (#113), `lyric-timestamp-viewer` (#117), `find-the-chorus` (#118), `lyrics-word-counter` (#119), `song-duration-silence-detector` (#120), `lrc-offset-adjuster` (#123), `lyrics-format-converter` (#124), `song-summary-generator` (#126), `streaming-link-finder` (#128), `plain-lyrics-extractor` (#129), `time-synced-lyrics-preview-player` (#130).
**Never** write a `mini` row for #111, #114, #115, #116, #121, #122 (tools not built) or #125, #127 (removed). Confirm each `tool_key` against the registry's valid-keys list before insert.

Each row sets: `slug`, `type`, `tool_key` (only if mini, else null), `title`, `meta_title`, `meta_description`, `content` (validated JSON), `competitor_slug` (comparison only, optional), `published: true`, `noindex: false`.

---

## 2. CONTENT QUALITY — the entire point of this task

New domains get penalized for thin, near-duplicate, or inaccurate pages. A penalized page is worse than no page. Treat every page as if it must earn its ranking on its own. Concretely:

### 2.1 No duplicates — this is the #1 failure mode
- **No template-filling.** "How to make an LRC file" and "How to make a TTML file" must NOT be the same page with the format name swapped. Different intros, different step emphasis, different examples, different FAQs, different framing.
- Before seeding each bucket, **run a self-similarity check**: compare each page's intro + H1 + first step against the others in the bucket. If two pages share sentence structure or phrasing beyond unavoidable shared terms, rewrite one. Report any pair above a reasonable similarity threshold and how you resolved it.
- Vary sentence openings, paragraph counts, example choices, and FAQ questions across pages. Two pages should never open with the same sentence pattern.
- Each page's `meta_description` must be unique (no shared boilerplate) and written to its specific search intent.

### 2.2 Match real search intent per page
- Write to where the searcher actually is. Someone on "convert SRT to LRC" **already has an SRT file** — don't tell them to upload audio first; meet them at the conversion. Someone on "how to make an LRC file" has audio and no file yet — start there. Someone on a "what is" page wants a definition first, tool second.
- Each page should answer its query in the first paragraph, then expand. Don't bury the answer under a generic intro.

### 2.3 Accuracy & fact-checking — verify, don't invent
- **Only state capabilities Syllary actually has** per SYLLARY.md. If unsure a feature exists, check the doc; if it's not there, don't claim it. Do not invent formats, integrations, plan features, or numbers.
- **For external facts** (how Apple Music ingests TTML, that Spotify pulls synced lyrics via Musixmatch and needs Premium to sync, what a distributor requires, how Suno/Udio export, what a competitor actually does), **verify with web search before writing the claim.** Do not assert platform behavior or competitor features from memory — these change. If a fact can't be verified, omit it or phrase it as the general, defensible version.
- **Competitor claims must be currently true.** Especially the ⚠️ rows (QuickLRC, Karadeo): they DO auto-transcribe, export all our formats plus ASS/PDF, have a correction editor and converters, and make Type-1 lyric/karaoke videos. **Do not claim format/feature superiority we don't have.** Verify each competitor's current capabilities by search before writing the comparison, and lead with our genuinely unique parts (hosted public page + words-in-the-scene video). Use the `honest_caveat` field to acknowledge overlap fairly.
- If web search reveals a topic-brief angle is now inaccurate (a competitor added/removed a feature, a platform changed), **flag it and adjust the page to the truth** rather than writing the stale angle.

### 2.4 SEO craft (on-page, legitimate — no keyword stuffing)
- **Title/H1:** include the primary keyword naturally, front-loaded. Sentence case, not Title Case.
- **`meta_title`:** ≤60 chars, primary keyword + brand where it fits.
- **`meta_description`:** ≤155 chars, includes the intent keyword and a concrete reason to click. Unique per page.
- **Slug:** lowercase-hyphen, short, keyword-bearing, stable (e.g. `convert-srt-to-lrc`). No dates in slugs.
- **Structure for featured snippets:** how-to pages use clear numbered steps (maps to `HowTo` JSON-LD the template emits); format/what-is pages open with a crisp 1–2 sentence definition (maps to a definition snippet); include a real FAQ where it fits (maps to `FAQPage` JSON-LD). The templates already emit the schema — your job is to provide content shaped to fill it.
- **Internal linking:** populate `related_slugs` with 2–4 genuinely related siblings (converters↔converters, a format page↔its how-to, a how-to↔the relevant mini-tool). This spreads link equity and is a real ranking factor for a new domain. Only link to slugs that exist in this batch.
- **Readability:** short paragraphs, plain language, concrete examples. Friendly tone per SYLLARY.md §9. No fluff intros ("In today's digital age…").

### 2.5 Depth without padding
- Each page should be substantial enough to be useful (a real answer, a worked example where relevant, a genuine FAQ) but **not padded to hit a word count.** Better a tight, complete 400-word page than a bloated 1,200-word one. Quality and completeness over length.

---

## 3. HARD RULES — non-negotiable, every page (from SYLLARY.md)

1. **Copyright wall.** Every page targets a TASK, TOOL, or COMPARISON — never copyrighted-lyrics content. No real song lyrics in examples (use placeholders like `[your lyric line]`). No commercial-artist lyric pages. No AI-cover-of-popular-song framing.
2. **Own/AI songs only.** Publishing, public pages, karaoke pages = the user's own or AI-generated songs, with the rights affirmation. Never imply hosting someone else's track.
3. **No tech/vendor names anywhere user-facing.** Banned in all copy: WAN, Nano Banana, FLUX, ffmpeg, Demucs, Scribe, ElevenLabs, OpenRouter, Gemini, Grok, Seedance, Replicate, fal.ai, Clerk, Supabase, Drizzle, wavesurfer, etc. Describe the experience, not the pipeline.
4. **Lyric-video language = plain words only:** "words typed over a background" (competitors), "words built into the scene," "scenes that move," "one continuous shot." Cinematic/one-shot mode is **early beta** — mention lightly, never lead. We do **NOT** make narrative music videos with performers/story — say so when relevant.
5. **Formats:** we export LRC, enhanced LRC, TTML, SRT, VTT, TXT, JSON only. **Never imply we output `.ass` or `.pdf`.** (#155 explains ASS but states we don't export it; #59/#156 may mention PDF as a *possible future* printable-sheet output, currently TXT.)
6. **Converter realism:** never offer JSON as a converter *input*. Real directions only (SRT↔VTT, SRT→LRC, TTML→LRC, LRC→TTML/SRT/VTT/TXT, etc.).
7. **The tightened wedge:** lead with *all formats + a hosted public song page + a lyric video where the words live in the scene, as one project, for your own/AI songs.* Don't lead with "all formats from one upload" alone (QuickLRC does that too).

---

## 4. The `content` shape per type

Match the **actual** Zod union in `packages/shared` (read it first — §0.3). The intended shapes, to fill with real content:

- **`comparison`** — competitor name, intro, 4–7 fair comparison rows (dimension / Syllary / competitor), `honest_caveat` (mandatory on ⚠️ rows), verdict, optional FAQ, CTA.
- **`how_to`** — intro that answers the query immediately, optional intent badges, numbered steps, an optional worked `example` (e.g. a sample `[mm:ss.xx]` line), optional tips, FAQ, `related_slugs`, CTA.
- **`format`** — crisp definition first, structure, where-used, related formats, FAQ, `related_slugs`, CTA.
- **`mini`** — short intro (the live tool is the hero), how-it-works, FAQ, `related_slugs`, CTA. For the client-side tools (#113, #119, #123, #124, #129) include the "your file never leaves your device / runs in your browser" line.
- **`ai_music`** — like `how_to`, strictly own/AI-songs framing.

All types share the CTA (default: upload audio → transcribe + sync → edit → export every format / publish a page / make a lyric video).

---

## 5. Seeding workflow (idempotent, validated, reviewable)

1. **Schema first.** Read the real Zod union and valid `tool_key` list. Note any field-name differences from this brief; the code wins.
2. **Build a seed script** in `apps/api/src/scripts` (e.g. `seed-landing-pages.ts`), reusing existing Drizzle access patterns. **Upsert on `slug`** so re-runs don't duplicate.
3. **Validate every row against the Zod schema before insert.** A row that doesn't validate must not be written — fix the content, not the schema.
4. **Generate and seed in batches by bucket, highest-intent first:** how_to (50) → comparison (30) → format (20) → ai_music (30) → added (10) → mini (12). After each batch:
   - Run the **self-similarity check** (§2.1) within and across batches; resolve duplicates.
   - Run a **banned-string grep** over the batch's copy: tech/vendor names (§3.3), `.ass`/`.pdf` as exports, JSON-as-input phrasing, any real song lyrics. Fix before continuing.
   - Confirm every `related_slugs` target exists; every `mini` `tool_key` is a live key.
5. **Do not auto-submit to Google Search Console.** The sitemap is auto-generated from published rows; just confirm it picks up all 152.
6. **Web-search-verify** external/competitor claims as you write them (§2.3) — not in a final pass, but before committing each claim.

---

## 6. Report at the end (don't finish silently)

Produce a short summary:
- Row counts by type (must be 30 / 50 / 20 / 12 / 30 / 10 = 152) and total published.
- Any topic-brief angles you changed because web search showed they were inaccurate, with the corrected fact + source.
- Any duplicate pairs the similarity check caught and how you resolved them.
- Any claims you omitted because you couldn't verify them.
- Banned-string grep result (should be zero hits).
- Confirmation the sitemap lists 152 published, indexable pages.
- Anything that blocked you or needed a guess (schema mismatch, missing tool key, etc.).

---

## 7. Out of scope (don't drift)
- Don't modify the schema, templates, tool registry, or any tool — content + seed script only.
- Don't write the 8 held mini-tool pages (tools not built).
- Don't build an admin CMS.
- Don't submit to Search Console.
- Don't pad pages to a word count.
