# Google Ads — launch build doc (copy-paste)

Everything needed to stand up the search campaigns. Order matters: do **Account settings → Conversion actions → Campaigns**, because the campaigns reference the conversions.

Budget frame: ~$35/day to start (G1 $15 + G2 $16 + G3 $4), inside the $1,500/mo cap. Brand campaign (G4) and Bing come later. This is a *validation* budget — see the GTM roadmap for the honest CAC math.

---

## 1. Settings

Google's nav splits these into two places. Only **auto-tagging** is a true pre-campaign account setting; Networks / Locations / Language / Bidding are **per-campaign** and only appear *inside the campaign-creation wizard* (§3), not beforehand.

**Account-level (do now):**
| Setting | Value | Where |
|---|---|---|
| **Auto-tagging** | **ON** | **Admin** (bottom-left) → **Account settings** → **Auto-tagging** → check "Tag the URL…". *Critical* — appends `gclid` to clicks, which our site stores and the weekly CSV needs. Without it, purchase tracking is dead. |
| Time zone / currency | confirm USD | Already set at signup; can't change later. |

**Per-campaign (set these while building each campaign in §3):**
| Setting | Value |
|---|---|
| Networks | **Search only** — untick "Search partners" and "Display Network". |
| Locations | **US, Canada, Australia, New Zealand**, then **Location options → "Presence: People in or regularly in your targeted locations"** (not "interest") — avoids people merely searching *about* those countries. |
| Language | English |
| Bidding | **Manual CPC** (or Maximize Clicks with a max-CPC cap). Switch to Maximize Conversions only after a campaign logs ≥30 conversions. |

---

## 2. Conversion actions (create these two before campaigns)

> **Where conversions live now:** the redesigned nav moved them out of Tools. Left menu → **Goals → Conversions → Summary** → **+ New conversion action**. (If you don't see "Goals," widen the window or look under the **Tools → Measurement** group — Google is mid-rollout and shows one or the other.)

### A. `purchase` — PRIMARY (offline import)
⚠️ **Pick the Import source, NOT "Website."** Purchases happen server-side (Stripe webhook) and upload via our weekly CSV — a Website/event-snippet action would never receive data and the CSV import can't attach to it.

Goals → Conversions → **+ New conversion action** → **Import** → **Other data sources or CRM** → "Track conversions from clicks".
- **Conversion action name:** `purchase` ← must be exactly this. Our CSV's "Conversion Name" column is hardcoded to `purchase`; any other name and the import silently drops every row.
- Category: **Purchase**
- Value: **Use the value from the file** (our CSV sends real cents per plan)
- Count: **One**
- Mark as **Primary**.
- Feeding it: weekly, download `https://api.syllary.com/admin/conversions/export.csv?source=google` (admin-only) and upload it under Conversions → Uploads. Rows auto-mark exported so each pull is only new conversions. *(I can wire a one-click admin button later; CSV is fine at this volume.)*

### B. `sign_up` — SECONDARY (website tag)
Goals → Conversions → **+ New conversion action** → **Website**.
- Name: `sign_up`
- Category: **Sign-up**
- Value: **Don't use a value** (or a small proxy like $2)
- Count: **One**
- Mark as **Secondary** (so it never drives bidding — purchase does).
- Setup method: **Google tag**. Turn **Enhanced conversions ON** → method "Google tag" (our code already sends `allow_enhanced_conversions: true` with the hashed email).
- After saving it shows a **Conversion ID** (`AW-XXXXXXXXX`) and a **conversion label** (`AbCdEf…`). **Send me both** → they become `VITE_GTAG_ID` and `VITE_GTAG_SIGNUP_LABEL`, I add them to Render, redeploy web, and the tag goes live. (Until then the site simply doesn't fire the tag — no errors.)

---

## 3. Campaigns

**Starting each campaign (so you get plain Search, not Performance Max):**
1. Campaigns → **+ Create campaign**.
2. Objective: choose **"Create a campaign without a goal's guidance"** (bottom option) — this stops Google steering you into Smart/Performance Max.
3. Campaign type: **Search**.
4. Uncheck any "broaden reach" / website-field prompts; click Continue.
5. Now the settings page appears with **Networks, Locations, Language, Bidding** (the §1 per-campaign values). Set them here.
6. Daily budget per the per-campaign amounts below.
7. Build the ad group(s), paste keywords + the RSA, set the final URL.

All three: Search, settings from §1, **exact + phrase match only** (no broad for the first 3 weeks). Each ad group gets one Responsive Search Ad (RSA). Final URLs below are all real, published pages.

Headlines are ≤30 chars, descriptions ≤90 — paste as-is. **No competitor/tool trademarks appear in any ad text** (they live only in keywords + landing-page copy); a brand-new account gets trademark disapprovals easily, so we keep copy generic.

---

### G1 — "Lyric files" · $15/day · message M1 (musicians shipping releases)

**Ad group 1.1 — LRC generator** → `https://syllary.com/guides/how-to-make-an-lrc-file`

Keywords (max-CPC cap in parens):
```
[lrc file generator]   ($0.90)
[lrc generator]        ($0.90)
[ai lrc generator]     ($1.00)
"lrc maker"            ($0.70)
"create lrc file"      ($0.60)
[mp3 to lrc]           ($0.70)
[mp3 to lrc converter] ($0.70)
[audio to lrc]         ($0.60)
"enhanced lrc"         ($0.60)
```

**Ad group 1.2 — Format conversion** → `https://syllary.com/convert/lrc-to-ttml`
```
[lrc to ttml]    ($0.70)
[lrc to srt]     ($0.60)
[srt to lrc]     ($0.60)
"ttml converter" ($1.10)
[lrc to vtt]     ($0.60)
```

**Ad group 1.3 — Synced lyrics for streaming** → `https://syllary.com/guides/how-to-add-synced-lyrics-to-spotify`
(also test `https://syllary.com/compare/musixmatch-alternative`)
```
"synced lyrics for my song"   ($1.00)
"add lyrics to spotify artist" ($1.20)
[synced lyrics file]          ($0.90)
"how to sync lyrics to audio" ($0.80)
[musixmatch alternative]      ($1.50)
```

**RSA copy for G1** (same set works across the three ad groups):

Headlines:
```
Make an LRC File Fast
Upload Audio, Get .lrc
Synced Lyrics in Minutes
Every Lyric File Format
LRC, SRT, VTT & More
Auto-Sync Your Lyrics
No Manual Timestamps
From Audio to Lyrics
Lyric Files for Artists
Fix Any Word, Keep Sync
Ready for Streaming
Make Synced Lyric Files
```
Descriptions:
```
Upload your track and get every synced lyric file format in about a minute. Try it free.
AI transcribes and syncs your lyrics word by word. Export LRC, SRT, VTT, TTML and more.
Stop typing timestamps by hand. Get platform-ready lyric files from one upload.
Built for musicians shipping releases. Every lyric format, validated and ready.
```
> ⚠️ Honesty caveat for 1.2/1.3: an indie artist often can't *self-submit* TTML to Apple Music or push an LRC straight to Spotify (those flow through Musixmatch/LyricFind/label pipelines). The copy above sticks to verifiable claims ("get the file," "for players/video/karaoke"). The landing pages should explain *how* synced lyrics actually reach each platform in 2026 — accuracy here is the trust wedge and avoids refund/chargeback risk.

---

### G2 — "AI lyric video" · $16/day · message M2 (AI-music creators)

**Ad group 2.1 — AI music → video** → `https://syllary.com/guides/lyric-video-for-your-suno-track`
```
[ai lyric video]          ($1.50)
"lyric video for ai song" ($1.20)
[ai music video maker]    ($1.80)
"song to lyric video"     ($1.20)
[make a lyric video from a song] ($1.50)
```

**Ad group 2.2 — Lyric video generic** → `https://syllary.com/guides/how-to-make-a-lyric-video`
```
[ai lyric video generator] ($2.50)
"ai lyric video maker"     ($2.50)
[lyric video generator]    ($3.00)
[automatic lyric video]    ($2.00)
```

**Ad group 2.3 — Competitive** (cap $2.50, watch daily) → `https://syllary.com/compare/best-lyric-video-maker`
(also `https://syllary.com/compare/specterr-alternative`)
```
"lyric video maker"     ($3.50)
"make a lyric video"    ($2.50)
[karaoke video maker]   ($2.50)
[specterr alternative]  ($2.00)
```

**RSA copy for G2:**

Headlines:
```
AI Lyric Video Maker
Your Song, As a Video
Words Inside the Scene
Lyric Video in Minutes
Made for AI Musicians
1080p Lyric Videos
Three Video Styles
From a Song to a Film
Auto-Synced to the Beat
Ready for YouTube
Preview Before You Pay
AI Scenes, Your Lyrics
```
Descriptions:
```
Turn your track into a synced 1080p lyric video where the words live in the scene.
Pick a style, preview it, then render in 1080p. Made for AI music creators.
Not text on a background. Real AI scenes built around every line you wrote.
Slideshow, living scenes, or cinematic. A finished lyric video in minutes.
```

---

### G3 — "Public page" · $4/day PROBE ONLY · message M3

Near-zero search volume expected. Run 2 weeks; if impressions <500/week, pause and move the $4 into G2 (the likely outcome). M3 is really a Reddit/YouTube/onsite message, not a search category.

**Ad group 3.1 — Page for your song** → `https://syllary.com/guides/public-lyrics-page-for-your-suno-song`
(also `https://syllary.com/guides/suno-song-to-full-lyrics-page`)
```
"page for my song"         ($0.80)
"share my song online"     ($0.80)
[lyrics page for my song]  ($0.80)
"karaoke page for my song" ($0.70)
```

**RSA copy for G3:**

Headlines:
```
A Page for Your Song
Share Your AI Music
A Home for Your Track
Lyrics Page, Made Easy
Show Off Your Song
Public Page in a Click
```
Descriptions:
```
Give your song a beautiful public page with synced lyrics, ready to share anywhere.
A shareable home for your music: synced lyrics, cover art, and a play-along page.
```

---

### G4 — Brand · $1/day · ADD WEEK 4 (not now)
One exact keyword `[syllary]` → `https://syllary.com`. Pennies per click; protects your name once awareness exists. Skipping until week 4 because nobody searches "syllary" yet.

---

## 4. Account-level negative keywords (shared list, apply to all)

Create one shared list (Tools → Shared library → Negative keyword lists) named "Global negatives" and attach to every campaign:
```
free download      download free      apk      mod apk
crack      torrent      reddit      login      sign in
lyrics meaning      meaning      what does ... mean
traduccion      translation      jobs      salary
karaoke machine      karaoke bar      near me      genius lyrics
azlyrics      spotify not showing lyrics
```
Then review the **Search terms report** daily in week 1 and add anything irrelevant — this is where most wasted spend gets cut early.

---

## 5. Sitelinks & extensions (do once, account level — free, lifts CTR a lot)

Sitelinks:
- **Pricing** → `https://syllary.com/#pricing`
- **Free tools** → `https://syllary.com/tools/lrc-validator`
- **Lyric videos** → `https://syllary.com/guides/how-to-make-a-lyric-video`
- **How it works** → `https://syllary.com`

Also add: **Callout extensions** (e.g. "Every format", "Word-by-word sync", "Free to try", "1080p MP4") and a **Structured snippet** (header "Service catalog": LRC, TTML, SRT, VTT, Lyric videos).

---

## 6. Launch-day checklist
1. Account settings done (auto-tagging ON especially).
2. Both conversion actions created; `AW-…` ID + signup label sent to me → live on the site.
3. Verify a real click shows `?gclid=…` landing on the site (open your own ad preview, or use the Google Ads "Ad preview & diagnosis" tool).
4. G1 + G2 + G3 enabled, global negatives attached, sitelinks live.
5. Day 1–7: check the Search terms report daily; pause any keyword with ≥$25 spend and 0 "song uploaded" events (visible in PostHog).

## What to send me after
- `AW-XXXXXXXXX` (Conversion ID) and the `sign_up` conversion **label** → I set `VITE_GTAG_ID` + `VITE_GTAG_SIGNUP_LABEL` in Render, redeploy web, and confirm both tags fire on the live site.
