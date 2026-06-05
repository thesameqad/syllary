import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 2 — How-to / Task pages (#31–90).
// guides/* for tasks; convert/* for directional format converters (which mount
// the universal converter tool). Steps blocks drive HowTo rich results. Each
// page meets the searcher where they are and answers in the first paragraph.

const cta = UNIVERSAL_CTA;

/** A directional text→text converter page that mounts the universal tool. */
function converterPage(opts: {
  slug: string;
  from: string;
  to: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  faq: { q: string; a: string }[];
  related: { label: string; href: string }[];
}): SeedPage {
  return {
    slug: opts.slug,
    category: "convert",
    renderType: "tool",
    toolKey: "format-converter",
    title: opts.title,
    metaTitle: opts.metaTitle,
    metaDescription: opts.metaDescription,
    blocks: [
      { kind: "paragraph", text: opts.intro },
      { kind: "toolEmbed", toolKey: "format-converter" },
      { kind: "heading", level: 2, text: "How to convert" },
      {
        kind: "steps",
        items: [
          { title: `Paste your ${opts.from}`, text: `Drop the contents of your ${opts.from} file into the box above.` },
          { title: "Pick the formats", text: `Choose ${opts.from} as the input and ${opts.to} as the output.` },
          { title: `Copy or download the ${opts.to}`, text: "Grab the converted file — it's generated right in your browser." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related converters",
        items: opts.related,
      },
      cta,
    ],
    faq: opts.faq,
  };
}

export const HOWTO_PAGES: SeedPage[] = [
  // 31 — how to make an LRC file (migrated + refreshed)
  {
    slug: "guides/how-to-make-an-lrc-file",
    category: "guides",
    renderType: "content",
    title: "How to make an LRC file",
    metaTitle: "How to make an LRC file (synced lyrics)",
    metaDescription:
      "Make an .lrc synced-lyrics file from your song in minutes — no manual timestamping. Upload audio, auto-sync, fix anything, and export.",
    blocks: [
      {
        kind: "definition",
        term: "An LRC file",
        text: "is plain-text lyrics with a timestamp on each line, so a player highlights the words in time with the song.",
      },
      {
        kind: "paragraph",
        text: "You don't need to type timestamps by hand. Upload your track, let it be transcribed and timed automatically, fix anything that's slightly off, and export a ready-to-use .lrc.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your track", text: "MP3, WAV, or FLAC. No lyrics sheet needed." },
          { title: "It transcribes and times every line", text: "Each line is aligned to the audio automatically." },
          { title: "Fix anything that's off", text: "Quick edits to a word or a timestamp in the editor." },
          { title: "Export your .lrc", text: "Plus every other format from the same upload." },
        ],
      },
      {
        kind: "code",
        code: "[ti:Your Song Title]\n[00:12.34] [your first line]\n[00:16.80] [your next line]",
        caption: "Each line starts with [mm:ss.xx] — the moment that line begins.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
          { label: "Enhanced (word-level) LRC", href: "/guides/how-to-make-an-enhanced-lrc-file" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need the lyrics written first?", a: "No — your track is transcribed automatically. You only tweak anything that's slightly off." },
      { q: "Can I use the LRC on a music player?", a: "Yes — most players read an .lrc placed next to the audio file with the same name." },
    ],
  },

  // 32 — enhanced LRC
  {
    slug: "guides/how-to-make-an-enhanced-lrc-file",
    category: "guides",
    renderType: "content",
    title: "How to make an enhanced (word-level) LRC file",
    metaTitle: "How to make an enhanced (word-level) LRC",
    metaDescription:
      "Enhanced LRC times each word, not just each line — the format behind karaoke highlighting. Here's how to generate one from your song automatically.",
    blocks: [
      {
        kind: "paragraph",
        text: "Standard LRC times each line; enhanced LRC adds a timestamp to each word, so players can highlight the lyrics word by word like karaoke. Syllary times words automatically, so you don't tag them by hand.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "The vocals are isolated and transcribed." },
          { title: "Words are timed automatically", text: "Each word gets its own start time, not just each line." },
          { title: "Export the enhanced .lrc", text: "Choose the enhanced LRC export to keep the word timings." },
        ],
      },
      {
        kind: "code",
        code: "[00:12.00]<00:12.00>[word] <00:12.50>[word] <00:13.10>[word]",
        caption: "Inside a line, each <mm:ss.xx> tag marks when a word is sung.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is enhanced LRC", href: "/guides/what-is-enhanced-lrc" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What's the difference from a normal LRC?", a: "A normal LRC times each line; enhanced LRC times each word, which is what makes karaoke-style highlighting possible." },
      { q: "Do all players support it?", a: "Many do, and those that don't simply fall back to line-level timing." },
    ],
  },

  // 33 — TTML for Apple Music
  {
    slug: "guides/how-to-make-a-ttml-file-for-apple-music",
    category: "guides",
    renderType: "content",
    title: "How to make a TTML file for Apple Music",
    metaTitle: "How to make a TTML file for Apple Music",
    metaDescription:
      "Apple Music uses TTML for time-synced lyrics, delivered through your distributor. Here's how to generate the TTML file from your song.",
    blocks: [
      {
        kind: "paragraph",
        text: "Apple Music shows time-synced lyrics from a TTML file, which your distributor delivers on your behalf. You can't upload it to Apple yourself, but you can produce an accurate TTML in Syllary and hand it to whoever delivers your release.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your exact audio version", text: "Time-sync must match the precise master you're releasing." },
          { title: "Review the timing", text: "Confirm the lines land where they're sung; fix any that drift." },
          { title: "Export TTML", text: "Choose the .ttml export and pass it to your distributor." },
        ],
      },
      {
        kind: "callout",
        text: "Different audio versions need different timing. Time-sync the same master you deliver to Apple. Check your distributor's current lyric-delivery steps, as these change.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is a TTML file", href: "/guides/what-is-a-ttml-file" },
          { label: "Add time-synced lyrics to Apple Music", href: "/guides/how-to-add-synced-lyrics-to-apple-music" },
          { label: "Prepare synced lyrics for distribution", href: "/guides/prepare-synced-lyrics-for-distribution" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I upload TTML to Apple directly?", a: "Generally no — distributors deliver lyrics to Apple Music. You provide them the TTML file." },
      { q: "Why does the timing have to match my master?", a: "A remaster or edit shifts when words are sung, so the sync must match the exact version you release." },
    ],
  },

  // 34 — SRT from a song
  {
    slug: "guides/how-to-make-an-srt-file-from-a-song",
    category: "guides",
    renderType: "content",
    title: "How to make an SRT file from a song",
    metaTitle: "How to make an SRT file from a song",
    metaDescription:
      "Turn a song into an .srt subtitle file for video. Upload the audio, auto-transcribe and time the lyrics, and export SRT — captions ready for any editor.",
    blocks: [
      {
        kind: "paragraph",
        text: "SRT is the standard subtitle format video tools accept. If you want your song's lyrics as captions, upload the track and export an .srt — the words are transcribed and timed for you, so you skip the manual subtitle work.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the song", text: "The lyrics are transcribed and aligned to the audio." },
          { title: "Check the lines", text: "Adjust any wording or timing before exporting." },
          { title: "Export SRT", text: "Import the .srt into your video editor as a subtitle track." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is an SRT file", href: "/guides/what-is-an-srt-file" },
          { label: "Make a VTT file from a song", href: "/guides/how-to-make-a-vtt-file-from-a-song" },
          { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is SRT the same as a lyrics file?", a: "SRT is a subtitle format for video; LRC is for music players. Syllary exports both from the same upload." },
    ],
  },

  // 35 — VTT from a song
  {
    slug: "guides/how-to-make-a-vtt-file-from-a-song",
    category: "guides",
    renderType: "content",
    title: "How to make a VTT (WebVTT) file from a song",
    metaTitle: "How to make a VTT file from a song",
    metaDescription:
      "Make a WebVTT (.vtt) caption file from your song for HTML5 video and the web. Auto-transcribe and time the lyrics, then export VTT.",
    blocks: [
      {
        kind: "paragraph",
        text: "WebVTT is the caption format the web uses — it's what HTML5 video players read for subtitles. To caption a song on a webpage, upload the audio and export a .vtt with the lyrics already timed.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the track", text: "Lyrics are transcribed and synced to the audio." },
          { title: "Review and fix", text: "Tidy any line or timestamp that needs it." },
          { title: "Export VTT", text: "Add the .vtt as a track on your HTML5 video." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is a VTT file", href: "/guides/what-is-a-vtt-file" },
          { label: "SRT vs VTT", href: "/guides/srt-vs-vtt" },
          { label: "Embed lyrics on your website", href: "/guides/embed-lyrics-on-your-website" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "VTT or SRT for the web?", a: "Use VTT for HTML5 video on the web; SRT is more common in desktop editors. You can export either." },
    ],
  },

  // 36 — JSON lyrics
  {
    slug: "guides/how-to-make-a-json-lyrics-file",
    category: "guides",
    renderType: "content",
    title: "How to make a JSON timed-lyrics file",
    metaTitle: "How to make a JSON timed-lyrics file",
    metaDescription:
      "Export your song's timed lyrics as structured JSON for apps and developers — lines, words, and timestamps in a machine-readable file.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you're building an app or pipeline, you want timed lyrics as data, not a subtitle file. Syllary can export the lines, words, and timestamps as JSON — ready to parse in code.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the song", text: "Get transcribed, timed lyrics." },
          { title: "Confirm the structure", text: "Lines and words are timed; correct anything first." },
          { title: "Export JSON", text: "Download the structured timed-lyrics data." },
        ],
      },
      {
        kind: "callout",
        text: "JSON is an output here, not an input — you generate it from your song. To convert between subtitle formats, use the converter instead.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is a JSON lyrics file", href: "/guides/what-is-a-json-lyrics-file" },
          { label: "Export every lyrics format at once", href: "/guides/export-every-lyrics-format-at-once" },
          { label: "Lyrics format converter", href: "/tools/lyrics-format-converter" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I convert a JSON file into an LRC?", a: "Converters work from subtitle/lyrics files like SRT, VTT, TTML and LRC. JSON is a developer output you generate from a song, not a converter input." },
    ],
  },

  // 37 — TXT from audio
  {
    slug: "guides/how-to-make-a-txt-lyrics-file",
    category: "guides",
    renderType: "content",
    title: "How to make a plain TXT lyrics file from audio",
    metaTitle: "How to make a TXT lyrics file from audio",
    metaDescription:
      "Get a clean, plain-text lyrics sheet from your song — no timestamps. Upload the audio, let it transcribe, and export a .txt.",
    blocks: [
      {
        kind: "paragraph",
        text: "Sometimes you just want the words on a page — no timing, no markup. Upload your song and export a plain .txt lyrics sheet, transcribed straight from the audio.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the song", text: "The lyrics are transcribed automatically." },
          { title: "Fix any wording", text: "Correct anything the transcription got slightly wrong." },
          { title: "Export TXT", text: "Download a clean, plain-text lyrics sheet." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Printable lyric sheet", href: "/guides/printable-lyric-sheet" },
          { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
          { label: "Transcribe song lyrics from audio", href: "/guides/transcribe-song-lyrics-from-audio" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Already have a timed file?", a: "If you have an LRC or SRT, strip the timing to plain text with the plain-lyrics extractor instead of re-transcribing." },
    ],
  },

  // 38 — Spotify
  {
    slug: "guides/how-to-add-synced-lyrics-to-spotify",
    category: "guides",
    renderType: "content",
    title: "How to add synced lyrics to Spotify",
    metaTitle: "How to add synced lyrics to Spotify",
    metaDescription:
      "Spotify shows synced lyrics through Musixmatch, after your track is live. Prepare accurate, timed lyrics first — here's the workflow.",
    blocks: [
      {
        kind: "paragraph",
        text: "Spotify doesn't take an LRC upload — it displays synced lyrics sourced through Musixmatch. The practical path: prepare clean, accurately-timed lyrics first, then submit them through a linked Musixmatch account after your song is live.",
      },
      {
        kind: "steps",
        items: [
          { title: "Time your lyrics in Syllary", text: "Upload the track and get accurate, line-by-line timing." },
          { title: "Release the song", text: "Lyrics can be added once the track is live on Spotify." },
          { title: "Submit through Musixmatch", text: "Link a Musixmatch account to your artist profile, add and sync the lyrics there." },
        ],
      },
      {
        kind: "callout",
        text: "Steps and account requirements on Spotify and Musixmatch change over time — check their current guidance before you submit.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What format does Spotify use for lyrics", href: "/guides/what-format-does-spotify-use-for-lyrics" },
          { label: "Prepare synced lyrics for distribution", href: "/guides/prepare-synced-lyrics-for-distribution" },
          { label: "Musixmatch vs Syllary", href: "/compare/musixmatch-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I upload an LRC straight to Spotify?", a: "No — Spotify pulls synced lyrics via Musixmatch. Syllary prepares accurate, timed lyrics; you submit through Musixmatch after release." },
      { q: "When can I add the lyrics?", a: "After the track is live. It can take a little time to appear in your Musixmatch roster." },
    ],
  },

  // 39 — Apple Music
  {
    slug: "guides/how-to-add-synced-lyrics-to-apple-music",
    category: "guides",
    renderType: "content",
    title: "How to add time-synced lyrics to Apple Music",
    metaTitle: "How to add synced lyrics to Apple Music",
    metaDescription:
      "Apple Music takes time-synced lyrics as TTML, delivered by your distributor. Produce the TTML for your exact master — here's how.",
    blocks: [
      {
        kind: "paragraph",
        text: "Apple Music's time-synced lyrics come from a TTML file your distributor delivers. Your job is to produce an accurate TTML for the exact master you're releasing, then hand it over for delivery.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the release master", text: "Use the precise audio version going to Apple Music." },
          { title: "Verify the sync", text: "Make sure every line lands where it's sung." },
          { title: "Export TTML and deliver", text: "Pass the .ttml to your distributor with your release." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "What format does Apple Music use", href: "/guides/what-format-does-apple-music-use-for-lyrics" },
          { label: "Add synced lyrics to Spotify", href: "/guides/how-to-add-synced-lyrics-to-spotify" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why TTML and not LRC?", a: "Apple Music's lyric system uses TTML. Syllary exports it; your distributor delivers it." },
    ],
  },

  // 40 — add lyrics to a song (general)
  {
    slug: "guides/how-to-add-lyrics-to-a-song",
    category: "guides",
    renderType: "content",
    title: "How to add lyrics to a song",
    metaTitle: "How to add lyrics to a song: the simple way",
    metaDescription:
      "New to lyric files? Here's the one-upload way to add synced lyrics to your song and get every format streaming platforms and players need.",
    blocks: [
      {
        kind: "paragraph",
        text: "\"Adding lyrics\" can mean a few different things — a file for your player, captions for a video, or synced lyrics on a streaming platform. The good news: one upload covers all of them. Here's the overview.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "The lyrics are transcribed and timed automatically." },
          { title: "Pick what you need", text: "A player file (LRC), captions (SRT/VTT), or TTML for streaming." },
          { title: "Export — or publish", text: "Download the files, or publish a public lyrics page." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which format do I actually need?", a: "It depends on the destination — LRC for players, TTML for Apple Music, SRT/VTT for video. You can export all of them at once." },
    ],
  },

  // 41 — auto-sync
  {
    slug: "guides/how-to-sync-lyrics-to-audio-automatically",
    category: "guides",
    renderType: "content",
    title: "How to sync lyrics to audio automatically",
    metaTitle: "How to sync lyrics to audio automatically",
    metaDescription:
      "Skip line-by-line tapping. Here's how automatic lyric sync works — and how to get perfectly timed lyrics from your song without manual timing.",
    blocks: [
      {
        kind: "paragraph",
        text: "Manual syncing means playing the track and tapping a key on every line. Automatic sync does that for you: the words are aligned to the audio timeline in one pass, and you only step in to correct the occasional line.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "No need to tap along or pre-type the lyrics." },
          { title: "Let it align", text: "Each line — and word — is matched to when it's sung." },
          { title: "Nudge anything off", text: "Use the editor to shift a timestamp if needed." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to time lyrics to music", href: "/guides/how-to-time-lyrics-to-music" },
          { label: "Make synced lyrics without typing", href: "/guides/make-synced-lyrics-without-typing" },
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How accurate is automatic sync?", a: "It's accurate enough to ship after a quick review — and the editor makes fixing any outliers fast." },
    ],
  },

  // 42 — time lyrics to music
  {
    slug: "guides/how-to-time-lyrics-to-music",
    category: "guides",
    renderType: "content",
    title: "How to time lyrics to music",
    metaTitle: "How to time lyrics to music",
    metaDescription:
      "Timing lyrics means marking when each line (or word) is sung. Here's what that involves and how to do it automatically from your audio.",
    blocks: [
      {
        kind: "paragraph",
        text: "Timing lyrics is about attaching a moment to each line so a player knows when to show it. You can do it by ear and by hand, but it's slow. The faster route is to let the words be matched to the audio automatically, then refine.",
      },
      {
        kind: "steps",
        items: [
          { title: "Start from the audio", text: "Upload the song so timing is measured from the real waveform." },
          { title: "Get line and word times", text: "Each line — and each word — gets a start time." },
          { title: "Refine the tricky parts", text: "Fast sections or ad-libs may want a small nudge." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is lyric synchronization", href: "/guides/what-is-lyric-synchronization" },
          { label: "Sync lyrics to audio automatically", href: "/guides/how-to-sync-lyrics-to-audio-automatically" },
          { label: "Line-level vs word-level sync", href: "/guides/line-level-vs-word-level-sync" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Line timing or word timing?", a: "Line timing is enough for most players; word timing enables karaoke-style highlighting. You can export both." },
    ],
  },

  // 43 — WAV to synced lyrics
  {
    slug: "convert/wav-to-synced-lyrics",
    category: "convert",
    renderType: "content",
    title: "Convert WAV to synced lyrics",
    metaTitle: "Convert WAV to synced lyrics",
    metaDescription:
      "Have a WAV master? Turn it into synced lyrics and every export format. Upload the WAV, auto-transcribe and time, then download LRC, SRT, TTML and more.",
    blocks: [
      {
        kind: "paragraph",
        text: "A WAV is a great starting point because it's lossless — clean audio means cleaner transcription. Upload your WAV and get timed lyrics plus every export format in one pass.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your WAV", text: "Lossless audio transcribes accurately." },
          { title: "Review the timed lyrics", text: "Fix any wording or timing." },
          { title: "Export what you need", text: "LRC, enhanced LRC, TTML, SRT, VTT, TXT or JSON." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert FLAC to synced lyrics", href: "/convert/flac-to-synced-lyrics" },
          { label: "Convert MP3 to LRC", href: "/convert/mp3-to-lrc" },
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does lossless audio help accuracy?", a: "Yes — a clean WAV or FLAC usually transcribes more accurately than a heavily compressed file." },
    ],
  },

  // 44 — MP3 to LRC
  {
    slug: "convert/mp3-to-lrc",
    category: "convert",
    renderType: "content",
    title: "Convert MP3 to LRC",
    metaTitle: "Convert MP3 to LRC online",
    metaDescription:
      "Turn an MP3 into a synced .lrc file. Upload the MP3, get the lyrics transcribed and timed automatically, and download the LRC — no manual syncing.",
    blocks: [
      {
        kind: "paragraph",
        text: "Got an MP3 and want an .lrc? Upload the file and you'll get a synced lyrics file back — the words are transcribed from the audio and timed line by line, so there's no tapping along.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your MP3", text: "Any standard MP3 works." },
          { title: "Lyrics are transcribed and timed", text: "Line-by-line timing, automatically." },
          { title: "Download the LRC", text: "Or grab every other format too." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
          { label: "How to add lyrics to an MP3 file", href: "/guides/how-to-add-lyrics-to-an-mp3-file" },
          { label: "Convert WAV to synced lyrics", href: "/convert/wav-to-synced-lyrics" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will it work on a low-quality MP3?", a: "Usually yes, though very low bitrate or noisy files can reduce accuracy. You can always fix wording in the editor." },
    ],
  },

  // 45 — FLAC
  {
    slug: "convert/flac-to-synced-lyrics",
    category: "convert",
    renderType: "content",
    title: "Convert FLAC to synced lyrics",
    metaTitle: "Convert FLAC to synced lyrics",
    metaDescription:
      "FLAC is supported. Upload your lossless file to get timed lyrics and export LRC, TTML, SRT, VTT and more — accurate transcription from clean audio.",
    blocks: [
      {
        kind: "paragraph",
        text: "FLAC keeps your audio lossless, which is ideal for transcription. Upload the file and turn it into timed lyrics and every export format you might need.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your FLAC", text: "Lossless quality helps the transcription." },
          { title: "Check and fix", text: "Review the timed lyrics before exporting." },
          { title: "Export the formats you need", text: "Players, streaming, video, or data." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert WAV to synced lyrics", href: "/convert/wav-to-synced-lyrics" },
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which formats are supported as input?", a: "MP3, WAV and FLAC. Each turns into timed lyrics you can export in every common format." },
    ],
  },

  // 46 — audio to LRC
  {
    slug: "convert/audio-to-lrc",
    category: "convert",
    renderType: "content",
    title: "Convert audio to LRC",
    metaTitle: "Convert audio to LRC",
    metaDescription:
      "Any supported audio file becomes a synced .lrc. Upload MP3, WAV or FLAC, and get timed lyrics plus every other lyric format from one pass.",
    blocks: [
      {
        kind: "paragraph",
        text: "Whatever your source — MP3, WAV or FLAC — the route to an LRC is the same: upload the audio, get the lyrics transcribed and timed, and download the file. No lyric sheet and no manual timestamps required.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload any supported audio", text: "MP3, WAV or FLAC." },
          { title: "Get timed lyrics", text: "Transcribed and aligned to the track." },
          { title: "Export the LRC", text: "Plus enhanced LRC and every other format." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert MP3 to LRC", href: "/convert/mp3-to-lrc" },
          { label: "Get an LRC file for your song", href: "/guides/get-an-lrc-file-for-your-song" },
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I have to type the lyrics?", a: "No — they're transcribed from the audio. You only correct anything that's off." },
    ],
  },

  // 47 — song to subtitles
  {
    slug: "convert/song-to-subtitles",
    category: "convert",
    renderType: "content",
    title: "Convert a song to subtitles (SRT/VTT)",
    metaTitle: "Convert a song to subtitles (SRT/VTT)",
    metaDescription:
      "Turn a song into subtitle files for video. Upload the audio and export SRT or VTT with the lyrics already transcribed and timed.",
    blocks: [
      {
        kind: "paragraph",
        text: "To caption a song in a video, you need a subtitle file — SRT for most editors, VTT for the web. Upload the track and export either, with the lyrics transcribed and timed so you don't subtitle by hand.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the song", text: "Lyrics are transcribed and timed." },
          { title: "Pick SRT or VTT", text: "SRT for editors, VTT for HTML5 web video." },
          { title: "Export and import", text: "Drop the subtitle file into your video." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make an SRT file from a song", href: "/guides/how-to-make-an-srt-file-from-a-song" },
          { label: "Make a VTT file from a song", href: "/guides/how-to-make-a-vtt-file-from-a-song" },
          { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "SRT or VTT?", a: "SRT works in most video editors; VTT is the web-native format for HTML5 players. Export whichever your destination wants." },
    ],
  },

  // 48 — lyrics to karaoke file
  {
    slug: "convert/lyrics-to-karaoke-file",
    category: "convert",
    renderType: "content",
    title: "Convert lyrics to a karaoke file",
    metaTitle: "Convert lyrics to a karaoke file",
    metaDescription:
      "Make a karaoke-style timed file from your song with word-level highlighting. Upload audio, get enhanced LRC, or publish a karaoke page. Own/AI songs.",
    blocks: [
      {
        kind: "paragraph",
        text: "Karaoke needs word-level timing so the lyrics light up as they're sung. Upload your own or AI-generated song, and the words are timed individually — export an enhanced LRC, or publish a karaoke-style page others can sing along to.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your own/AI song", text: "Karaoke output is for songs you own or generated." },
          { title: "Get word-level timing", text: "Each word is timed for highlight-as-sung." },
          { title: "Export or publish", text: "Enhanced LRC to download, or a public karaoke page." },
        ],
      },
      {
        kind: "callout",
        text: "Make karaoke files for your own or AI-generated songs only — not someone else's copyrighted recording.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make karaoke lyrics from a song", href: "/guides/make-karaoke-lyrics-from-a-song" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is this for any song?", a: "Karaoke output is for your own or AI-generated songs, with a rights affirmation when you publish." },
    ],
  },

  // 49–58, 60 — format converters (tool-backed)
  converterPage({
    slug: "convert/lrc-to-ttml",
    from: ".lrc",
    to: ".ttml",
    title: "LRC to TTML converter",
    metaTitle: "LRC to TTML converter (free)",
    metaDescription:
      "Convert an .lrc to a TTML file in your browser. Reuse your timed lyrics for Apple Music's format — no re-timing, no upload.",
    intro:
      "Already have an .lrc and need TTML — the format Apple Music uses? Paste your LRC and convert it to TTML directly, reusing the timings you already have.",
    faq: [
      { q: "Why convert LRC to TTML?", a: "TTML is the format distributors deliver to Apple Music. If you have an LRC already, converting saves you re-timing the lyrics." },
    ],
    related: [
      { label: "TTML to LRC converter", href: "/convert/ttml-to-lrc" },
      { label: "LRC to SRT converter", href: "/convert/lrc-to-srt" },
      { label: "What is a TTML file", href: "/guides/what-is-a-ttml-file" },
    ],
  }),
  converterPage({
    slug: "convert/ttml-to-lrc",
    from: ".ttml",
    to: ".lrc",
    title: "TTML to LRC converter",
    metaTitle: "TTML to LRC converter (free)",
    metaDescription:
      "Convert a TTML file to an .lrc in your browser. Turn Apple-style timed lyrics into the universal LRC format for players — no re-timing.",
    intro:
      "Have a TTML file and want an .lrc for music players or local files? Paste the TTML and convert it to LRC, keeping the existing line timings.",
    faq: [
      { q: "Does it keep word timing?", a: "Line timings carry over directly. If your TTML has word-level timing, the converter uses what's there." },
    ],
    related: [
      { label: "LRC to TTML converter", href: "/convert/lrc-to-ttml" },
      { label: "TTML to SRT converter", href: "/convert/ttml-to-srt" },
      { label: "LRC vs TTML", href: "/guides/lrc-vs-ttml" },
    ],
  }),
  converterPage({
    slug: "convert/srt-to-lrc",
    from: ".srt",
    to: ".lrc",
    title: "SRT to LRC converter",
    metaTitle: "SRT to LRC converter (free)",
    metaDescription:
      "Convert an .srt subtitle file to an .lrc lyrics file in your browser. Turn video captions into a music-player format — instant, no upload.",
    intro:
      "Have an SRT subtitle file and want an LRC for music players? Paste the SRT and convert it — the cue timings become LRC line timestamps.",
    faq: [
      { q: "Why turn subtitles into an LRC?", a: "SRT is for video; LRC is for music players and local files. Converting lets you reuse the same timed lines in a player." },
    ],
    related: [
      { label: "LRC to SRT converter", href: "/convert/lrc-to-srt" },
      { label: "VTT to LRC converter", href: "/convert/vtt-to-lrc" },
      { label: "LRC vs SRT", href: "/guides/lrc-vs-srt" },
    ],
  }),
  converterPage({
    slug: "convert/lrc-to-srt",
    from: ".lrc",
    to: ".srt",
    title: "LRC to SRT converter",
    metaTitle: "LRC to SRT converter (free)",
    metaDescription:
      "Convert an .lrc lyrics file to an .srt subtitle file in your browser. Take your synced lyrics into any video editor — instant, nothing uploaded.",
    intro:
      "LRC files carry line timings for music players; SRT is what video editors expect. Paste your .lrc and get a clean .srt back to use in your video.",
    faq: [
      { q: "Is anything uploaded?", a: "No — the conversion happens entirely in your browser; your file never leaves your device." },
    ],
    related: [
      { label: "SRT to LRC converter", href: "/convert/srt-to-lrc" },
      { label: "LRC to VTT converter", href: "/convert/lrc-to-vtt" },
      { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
    ],
  }),
  converterPage({
    slug: "convert/vtt-to-lrc",
    from: ".vtt",
    to: ".lrc",
    title: "VTT to LRC converter",
    metaTitle: "VTT to LRC converter (free)",
    metaDescription:
      "Convert a WebVTT (.vtt) file to an .lrc in your browser. Turn web captions into a music-player lyrics format — instant and private.",
    intro:
      "Have a WebVTT caption file and want an LRC? Paste the VTT and convert it — the web caption cues become LRC line timestamps.",
    faq: [
      { q: "VTT and LRC — what's the difference?", a: "VTT captions web video; LRC drives lyrics in music players. Converting reuses the same timing in a different home." },
    ],
    related: [
      { label: "LRC to VTT converter", href: "/convert/lrc-to-vtt" },
      { label: "SRT to LRC converter", href: "/convert/srt-to-lrc" },
      { label: "What is a VTT file", href: "/guides/what-is-a-vtt-file" },
    ],
  }),
  converterPage({
    slug: "convert/lrc-to-vtt",
    from: ".lrc",
    to: ".vtt",
    title: "LRC to VTT converter",
    metaTitle: "LRC to VTT converter (free)",
    metaDescription:
      "Convert an .lrc to a WebVTT (.vtt) file in your browser. Take your synced lyrics to the web for HTML5 video captions — instant.",
    intro:
      "Need your synced lyrics as web captions? Paste your .lrc and convert it to WebVTT, ready to attach to an HTML5 video.",
    faq: [
      { q: "Why VTT for the web?", a: "WebVTT is the caption format HTML5 video players read. Converting an LRC lets you reuse your timing online." },
    ],
    related: [
      { label: "VTT to LRC converter", href: "/convert/vtt-to-lrc" },
      { label: "LRC to SRT converter", href: "/convert/lrc-to-srt" },
      { label: "Embed lyrics on your website", href: "/guides/embed-lyrics-on-your-website" },
    ],
  }),
  converterPage({
    slug: "convert/srt-to-vtt",
    from: ".srt",
    to: ".vtt",
    title: "SRT to VTT converter",
    metaTitle: "SRT to VTT converter (free)",
    metaDescription:
      "Convert an .srt subtitle file to WebVTT (.vtt) in your browser. Move captions from a video editor to the web — instant, nothing uploaded.",
    intro:
      "SRT is the editor standard; VTT is the web's. Paste your .srt and convert it to WebVTT to use your captions on an HTML5 video.",
    faq: [
      { q: "Are SRT and VTT interchangeable?", a: "They're close, but the syntax differs slightly. Converting handles the differences so the file works where you need it." },
    ],
    related: [
      { label: "VTT to SRT converter", href: "/convert/vtt-to-srt" },
      { label: "SRT vs VTT", href: "/guides/srt-vs-vtt" },
      { label: "LRC to VTT converter", href: "/convert/lrc-to-vtt" },
    ],
  }),
  converterPage({
    slug: "convert/vtt-to-srt",
    from: ".vtt",
    to: ".srt",
    title: "VTT to SRT converter",
    metaTitle: "VTT to SRT converter (free)",
    metaDescription:
      "Convert a WebVTT (.vtt) file to .srt in your browser. Take web captions into a desktop video editor — instant and private.",
    intro:
      "Have a WebVTT file but your editor wants SRT? Paste the VTT and convert it to SubRip format in seconds.",
    faq: [
      { q: "Will the timing stay exact?", a: "Yes — the cue times carry across; only the file syntax changes." },
    ],
    related: [
      { label: "SRT to VTT converter", href: "/convert/srt-to-vtt" },
      { label: "VTT to LRC converter", href: "/convert/vtt-to-lrc" },
      { label: "What is an SRT file", href: "/guides/what-is-an-srt-file" },
    ],
  }),
  converterPage({
    slug: "convert/ttml-to-srt",
    from: ".ttml",
    to: ".srt",
    title: "TTML to SRT converter",
    metaTitle: "TTML to SRT converter (free)",
    metaDescription:
      "Convert a TTML file to an .srt subtitle in your browser. Turn Apple-style timed lyrics into captions for any video editor — instant.",
    intro:
      "Have a TTML file and need plain subtitles? Paste the TTML and convert it to SRT to use the timing in a video editor.",
    faq: [
      { q: "Why convert TTML to SRT?", a: "TTML is rich and streaming-oriented; SRT is simple and universal in editors. Converting gives you a file any editor accepts." },
    ],
    related: [
      { label: "TTML to LRC converter", href: "/convert/ttml-to-lrc" },
      { label: "SRT to VTT converter", href: "/convert/srt-to-vtt" },
      { label: "What is a TTML file", href: "/guides/what-is-a-ttml-file" },
    ],
  }),
  converterPage({
    slug: "convert/lrc-to-json",
    from: ".lrc",
    to: ".json",
    title: "LRC to JSON converter",
    metaTitle: "LRC to JSON converter (free)",
    metaDescription:
      "Convert an .lrc to structured JSON in your browser — timed lines and words as data for apps and developers. Instant, nothing uploaded.",
    intro:
      "Building something with lyrics data? Paste your .lrc and convert it to JSON to get the timed lines (and words, where present) as structured data.",
    faq: [
      { q: "Can I convert JSON back into an LRC?", a: "Converters read subtitle/lyrics files like LRC, SRT, VTT and TTML. JSON is a developer output, not a converter input." },
    ],
    related: [
      { label: "What is a JSON lyrics file", href: "/guides/what-is-a-json-lyrics-file" },
      { label: "LRC to TXT (extract plain lyrics)", href: "/convert/lrc-to-txt" },
      { label: "Lyrics format converter", href: "/tools/lyrics-format-converter" },
    ],
  }),

  // 59 — printable lyric sheet
  {
    slug: "guides/printable-lyric-sheet",
    category: "guides",
    renderType: "content",
    title: "Make a printable lyric sheet from a song",
    metaTitle: "Make a printable lyric sheet from a song",
    metaDescription:
      "Need a clean lyric sheet to print — for liner notes, rehearsal, or a publishing contact? Get plain, timestamp-free lyrics from your song.",
    blocks: [
      {
        kind: "paragraph",
        text: "A printable lyric sheet is just the words, laid out cleanly with no timestamps — for liner notes, rehearsing, handing to a session singer, or attaching to a publishing or sync contact. Upload your song and export a plain-text sheet you can print.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "The lyrics are transcribed automatically." },
          { title: "Correct the wording", text: "Make sure every line reads exactly right." },
          { title: "Export plain text", text: "Print the .txt, or paste it into your document." },
        ],
      },
      {
        kind: "callout",
        text: "Today this is a clean TXT export you can print. A formatted, printable PDF sheet is a possible future addition.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is a printable lyric sheet", href: "/guides/what-is-a-printable-lyric-sheet" },
          { label: "Make a TXT lyrics file from audio", href: "/guides/how-to-make-a-txt-lyrics-file" },
          { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I get a PDF?", a: "The current export is plain text, which prints cleanly. A formatted PDF sheet may come later." },
    ],
  },

  converterPage({
    slug: "convert/lrc-to-txt",
    from: ".lrc",
    to: ".txt",
    title: "LRC to TXT (extract plain lyrics)",
    metaTitle: "LRC to TXT: extract plain lyrics",
    metaDescription:
      "Convert an .lrc to plain text in your browser — strip every timestamp and keep just the lyrics. Instant, nothing uploaded.",
    intro:
      "Want just the words from a timed file? Paste your .lrc and convert it to plain text — every [mm:ss.xx] timestamp is removed, leaving the lyrics.",
    faq: [
      { q: "Does it work with SRT or VTT too?", a: "Yes — the plain-lyrics extractor strips timing from LRC, SRT, VTT and TTML files." },
    ],
    related: [
      { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
      { label: "Printable lyric sheet", href: "/guides/printable-lyric-sheet" },
      { label: "Lyrics word counter", href: "/tools/lyrics-word-counter" },
    ],
  }),

  // 61 — files ready to ship
  {
    slug: "guides/lyric-files-for-streaming-platforms",
    category: "guides",
    renderType: "content",
    title: "Get lyric files ready to ship to streaming platforms",
    metaTitle: "Lyric files for streaming platforms",
    metaDescription:
      "Different platforms want different lyric files. Here's how one upload produces the formats you'll hand to a distributor for streaming.",
    blocks: [
      {
        kind: "paragraph",
        text: "Streaming platforms don't all use the same lyric file. Apple Music wants TTML through your distributor; Spotify shows lyrics via Musixmatch. The simplest approach is to produce every format from one upload, then give your distributor what it asks for.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your release master", text: "Time the lyrics to the exact audio you'll ship." },
          { title: "Export every format", text: "TTML, LRC, SRT, VTT, TXT and JSON in one pass." },
          { title: "Hand off to your distributor", text: "Provide the files or follow their lyric-delivery flow." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Prepare synced lyrics for distribution", href: "/guides/prepare-synced-lyrics-for-distribution" },
          { label: "Add synced lyrics to Apple Music", href: "/guides/how-to-add-synced-lyrics-to-apple-music" },
          { label: "Export every lyrics format at once", href: "/guides/export-every-lyrics-format-at-once" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which file goes to which platform?", a: "TTML for Apple Music (via your distributor); Spotify via Musixmatch after release. Exporting everything keeps you covered." },
    ],
  },

  // 62 — prepare for distribution
  {
    slug: "guides/prepare-synced-lyrics-for-distribution",
    category: "guides",
    renderType: "content",
    title: "How to prepare synced lyrics for distribution",
    metaTitle: "Prepare synced lyrics for distribution",
    metaDescription:
      "A short checklist for getting your lyrics distribution-ready: accurate words, timing to your master, and the right export formats.",
    blocks: [
      {
        kind: "paragraph",
        text: "Distribution-ready lyrics come down to three things: the words are accurate, the timing matches the exact master you're releasing, and you have the formats your distributor needs. Here's how to get there.",
      },
      {
        kind: "steps",
        items: [
          { title: "Transcribe and correct", text: "Make the words match the vocal exactly." },
          { title: "Time to your release master", text: "Sync to the version you're shipping, not a demo." },
          { title: "Export the right formats", text: "TTML for Apple; keep LRC/SRT/VTT for everything else." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Lyric files for streaming platforms", href: "/guides/lyric-files-for-streaming-platforms" },
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why does timing have to match the master?", a: "Edits and remasters shift when words land, so synced lyrics must match the exact version you distribute." },
    ],
  },

  // 63 — karaoke lyrics
  {
    slug: "guides/make-karaoke-lyrics-from-a-song",
    category: "guides",
    renderType: "content",
    title: "How to make karaoke lyrics from your song",
    metaTitle: "Make karaoke lyrics from your song",
    metaDescription:
      "Turn your own or AI-generated song into karaoke lyrics with word-level timing — export an enhanced LRC or publish a sing-along page.",
    blocks: [
      {
        kind: "paragraph",
        text: "Karaoke lyrics highlight word by word as the song plays. For your own or AI-generated track, upload it, get word-level timing, and either export an enhanced LRC or publish a public page where others can follow along.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your own/AI song", text: "This is for songs you own or generated." },
          { title: "Get word-level timing", text: "Each word is timed for highlight-as-sung." },
          { title: "Export or publish", text: "Download enhanced LRC, or publish a karaoke page." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert lyrics to a karaoke file", href: "/convert/lyrics-to-karaoke-file" },
          { label: "Make a karaoke video with words highlighted", href: "/guides/make-a-karaoke-video-with-words-highlighted" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can listeners sing along online?", a: "Yes — publish a public page and the synced reader highlights the words as the song plays." },
    ],
  },

  // 64 — captions for a music video
  {
    slug: "guides/add-captions-to-a-music-video",
    category: "guides",
    renderType: "content",
    title: "How to add captions to a music video",
    metaTitle: "How to add captions to a music video",
    metaDescription:
      "Add lyric captions to a music video for YouTube or social. Generate an SRT or VTT from your song and import it as a subtitle track.",
    blocks: [
      {
        kind: "paragraph",
        text: "Captions make a music video accessible and watchable on mute. Generate a subtitle file from your song's lyrics, then add it to your video — no typing captions line by line.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the song", text: "Get the lyrics transcribed and timed." },
          { title: "Export SRT or VTT", text: "SRT for editors and YouTube; VTT for the web." },
          { title: "Add it to your video", text: "Import the subtitle track and position it." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make subtitles for a song on YouTube", href: "/guides/make-subtitles-for-a-song-on-youtube" },
          { label: "Convert a song to subtitles", href: "/convert/song-to-subtitles" },
          { label: "Time lyrics for TikTok/Reels", href: "/guides/time-lyrics-for-tiktok-reels" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will YouTube accept the file?", a: "Yes — YouTube takes SRT (and other) subtitle files you can upload to a video." },
    ],
  },

  // 65 — how to make a lyric video (generic)
  {
    slug: "guides/how-to-make-a-lyric-video",
    category: "guides",
    renderType: "content",
    title: "How to make a lyric video",
    metaTitle: "How to make a lyric video",
    metaDescription:
      "Make a synced lyric video from your song. Understand the visual options in plain terms and generate one from your timed lyrics — visualization, not a film.",
    blocks: [
      {
        kind: "paragraph",
        text: "A \"lyric video\" can mean a few different looks. In plain terms: words typed over a background, words built into the scene, or scenes that move with the song. Syllary generates the synced video from your timed lyrics — it's a visualization of the words, not a story film with performers.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "Lyrics are transcribed and timed first." },
          { title: "Choose the look", text: "From words over a background to words inside a moving scene." },
          { title: "Generate the video", text: "The synced lyric video is built for you." },
        ],
      },
      {
        kind: "callout",
        text: "A one-continuous-shot mode exists in early beta. Syllary makes lyric visualizations, not narrative music videos with a plot or performers.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to make a lyric video for a song", href: "/guides/how-to-make-a-lyric-video-for-a-song" },
          { label: "Make a karaoke video with words highlighted", href: "/guides/make-a-karaoke-video-with-words-highlighted" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is it a real music video?", a: "No — it's a lyric visualization. The focus is the words, visualized, not a narrative film." },
    ],
  },

  // 66 — transcribe lyrics
  {
    slug: "guides/transcribe-song-lyrics-from-audio",
    category: "guides",
    renderType: "content",
    title: "How to transcribe song lyrics from audio",
    metaTitle: "How to transcribe song lyrics from audio",
    metaDescription:
      "Get accurate lyrics from a recording without typing them. Upload the song and the vocals are isolated and transcribed automatically.",
    blocks: [
      {
        kind: "paragraph",
        text: "Transcribing a song is harder than transcribing speech, because the vocals share space with instruments. The reliable approach is to isolate the voice first, then transcribe — which is what happens automatically when you upload your track.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the recording", text: "No lyric sheet needed." },
          { title: "Vocals are isolated and read", text: "Separating the voice improves accuracy." },
          { title: "Correct any words", text: "Fix the few words AI might mishear." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Fix incorrect auto-transcribed lyrics", href: "/guides/fix-incorrect-auto-transcribed-lyrics" },
          { label: "Make a TXT lyrics file from audio", href: "/guides/how-to-make-a-txt-lyrics-file" },
          { label: "Best AI lyrics transcription tools", href: "/compare/best-ai-lyrics-transcription-tools" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What if the mix is dense?", a: "Isolating the vocal first helps a lot, and you can correct any remaining words quickly in the editor." },
    ],
  },

  // 67 — fix transcription
  {
    slug: "guides/fix-incorrect-auto-transcribed-lyrics",
    category: "guides",
    renderType: "content",
    title: "How to fix incorrect auto-transcribed lyrics",
    metaTitle: "Fix incorrect auto-transcribed lyrics",
    metaDescription:
      "AI gets most lyrics right and a few words wrong. Here's how to correct words and timing fast, with a live preview, so the file is perfect before export.",
    blocks: [
      {
        kind: "paragraph",
        text: "Automatic transcription is a strong first draft, not gospel — a mumbled line or an unusual word can slip through. Fixing it is quick: edit the wrong word in place, and the timing stays intact.",
      },
      {
        kind: "steps",
        items: [
          { title: "Spot the line", text: "Play along and find any word that's off." },
          { title: "Edit it in place", text: "Correct the text without losing the timestamps." },
          { title: "Fine-tune timing if needed", text: "Nudge a line that drifts in a fast section." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
          { label: "Transcribe song lyrics from audio", href: "/guides/transcribe-song-lyrics-from-audio" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does editing a word break the timing?", a: "No — you can fix the text while keeping each line's timestamp, then nudge timing separately if needed." },
    ],
  },

  // 68 — edit lyric timing
  {
    slug: "guides/edit-lyric-timing",
    category: "guides",
    renderType: "content",
    title: "How to edit lyric timing",
    metaTitle: "How to edit lyric timing",
    metaDescription:
      "Nudge a line that shows too early or too late, with a live preview. Here's how to fine-tune lyric timing after an automatic sync.",
    blocks: [
      {
        kind: "paragraph",
        text: "Even good automatic sync can drift in a fast pre-chorus or a held note. Editing the timing is a matter of nudging the line earlier or later until it lands, watching a live preview as you go.",
      },
      {
        kind: "steps",
        items: [
          { title: "Find the off line", text: "Watch the preview to catch a line that's early or late." },
          { title: "Shift its time", text: "Move the timestamp until it matches the vocal." },
          { title: "Re-check in context", text: "Play around the edit to confirm it flows." },
        ],
      },
      {
        kind: "callout",
        text: "If the whole file is uniformly early or late, shift every timestamp at once with the offset adjuster instead of editing line by line.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "Fix incorrect auto-transcribed lyrics", href: "/guides/fix-incorrect-auto-transcribed-lyrics" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Everything is slightly late — do I fix each line?", a: "No — apply a single negative offset to the whole file to shift all timestamps at once." },
    ],
  },

  // 69 — podcast
  {
    slug: "guides/synced-lyrics-for-a-podcast",
    category: "guides",
    renderType: "content",
    title: "How to make a timed transcript for a podcast",
    metaTitle: "Timed transcript for a podcast or spoken audio",
    metaDescription:
      "Turn spoken audio into a timed transcript. Upload the episode and export SRT, VTT or JSON with timestamps — captions and show notes made easy.",
    blocks: [
      {
        kind: "paragraph",
        text: "It's not only for songs — spoken audio works too. Upload a podcast episode or voice recording and get a timed transcript you can export as captions or structured data.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the episode", text: "Speech is transcribed and timestamped." },
          { title: "Tidy the text", text: "Fix names or terms the transcription missed." },
          { title: "Export captions or data", text: "SRT/VTT for video, or JSON for your app." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make an SRT file from a song", href: "/guides/how-to-make-an-srt-file-from-a-song" },
          { label: "Make a JSON timed-lyrics file", href: "/guides/how-to-make-a-json-lyrics-file" },
          { label: "Transcribe song lyrics from audio", href: "/guides/transcribe-song-lyrics-from-audio" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does it timestamp speech?", a: "Yes — spoken audio gets line-level timestamps you can export as captions or JSON." },
    ],
  },

  // 70 — public page
  {
    slug: "guides/create-a-public-lyrics-page",
    category: "guides",
    renderType: "content",
    title: "How to create a public lyrics page for your song",
    metaTitle: "Create a public lyrics page for your song",
    metaDescription:
      "Publish an opt-in public page for your own or AI song: a synced reader, downloads, streaming links and a lyric video — all in one place.",
    blocks: [
      {
        kind: "paragraph",
        text: "A public lyrics page is a single page where listeners read along in time with your song, grab the files, follow streaming links and watch the lyric video. Publishing is opt-in and for your own or AI-generated songs.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload and finish your song", text: "Get the timed lyrics ready." },
          { title: "Choose to publish", text: "Opt in, confirming it's your own or AI song." },
          { title: "Share the page", text: "Send the link; the page shows the synced reader, downloads and links." },
        ],
      },
      {
        kind: "callout",
        text: "Public pages are for your own or AI-generated songs only — not someone else's copyrighted recording.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Embed lyrics on your website", href: "/guides/embed-lyrics-on-your-website" },
          { label: "Karaoke page for your AI song", href: "/guides/make-karaoke-lyrics-from-a-song" },
          { label: "Genius alternative (own songs)", href: "/compare/genius-alternative" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is publishing required?", a: "No — it's optional and opt-in. You can keep everything private and just download files if you prefer." },
    ],
  },

  // 71 — embed
  {
    slug: "guides/embed-lyrics-on-your-website",
    category: "guides",
    renderType: "content",
    title: "How to embed lyrics on your website",
    metaTitle: "How to embed lyrics on your website",
    metaDescription:
      "Put a synced lyrics player on your own site with an embeddable widget from your published page — listeners read along in time with the song.",
    blocks: [
      {
        kind: "paragraph",
        text: "Once your song has a public page, you can embed its synced lyrics player on your own website — a small widget where visitors read along with the track, without leaving your page.",
      },
      {
        kind: "steps",
        items: [
          { title: "Publish the page", text: "First, publish your own/AI song's public page." },
          { title: "Grab the embed", text: "Copy the embed snippet for the song." },
          { title: "Paste it on your site", text: "Drop it into your page where you want the player." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
          { label: "Make lyrics scroll with the music", href: "/guides/make-lyrics-scroll-with-the-music" },
          { label: "What are synced lyrics", href: "/guides/what-are-synced-lyrics" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need to publish first?", a: "Yes — the embeddable player comes from your published public page." },
    ],
  },

  // 72 — word-by-word highlighting
  {
    slug: "guides/word-by-word-karaoke-highlighting",
    category: "guides",
    renderType: "content",
    title: "How to make word-by-word (karaoke) highlighting",
    metaTitle: "Word-by-word karaoke highlighting",
    metaDescription:
      "Highlight lyrics as each word is sung. Here's how word-level timing creates karaoke highlighting — and how to generate it from your song.",
    blocks: [
      {
        kind: "paragraph",
        text: "Word-by-word highlighting lights up each word exactly as it's sung — the karaoke effect. It needs word-level timing, not just line timing. Upload your song and the words are timed individually, ready to highlight.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your song", text: "The vocal is transcribed and timed." },
          { title: "Words get individual times", text: "Not just lines — each word has a start." },
          { title: "Use it", text: "Export enhanced LRC or show it on a public page." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make an enhanced LRC file", href: "/guides/how-to-make-an-enhanced-lrc-file" },
          { label: "Line-level vs word-level sync", href: "/guides/line-level-vs-word-level-sync" },
          { label: "Time-synced lyrics preview player", href: "/tools/synced-lyrics-preview-player" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What format stores word timing?", a: "Enhanced LRC and TTML can hold word-level timing; standard LRC and basic subtitles are line-level." },
    ],
  },

  // 73 — own song LRC
  {
    slug: "guides/get-an-lrc-file-for-your-song",
    category: "guides",
    renderType: "content",
    title: "How to get an LRC file for your own song",
    metaTitle: "Get an LRC file for your own song",
    metaDescription:
      "Have a track you made and want an .lrc? Upload it, get synced lyrics automatically, and download the LRC — plus every other format.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you wrote or generated the song, getting an LRC is straightforward and entirely above board — it's your work. Upload the track, get timed lyrics, and download the .lrc.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your track", text: "Your own or AI-generated song." },
          { title: "Get the synced lyrics", text: "Transcribed and timed automatically." },
          { title: "Download the LRC", text: "And any other format you want." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is this only for my own songs?", a: "Downloading files works for any audio you upload, but publishing and karaoke pages are for your own or AI-generated songs." },
    ],
  },

  // 74 — local sidecar
  {
    slug: "guides/add-lyrics-to-local-music-files",
    category: "guides",
    renderType: "content",
    title: "How to add lyrics to local music files (LRC sidecar)",
    metaTitle: "Add lyrics to local music files (LRC sidecar)",
    metaDescription:
      "Show synced lyrics in your music player with an LRC sidecar. Export an .lrc, give it the same name as your audio, and drop it alongside.",
    blocks: [
      {
        kind: "paragraph",
        text: "Most music players show synced lyrics if there's an .lrc file sitting next to the audio with the same filename — a \"sidecar.\" Make the LRC, name it to match, and your player picks it up.",
      },
      {
        kind: "steps",
        items: [
          { title: "Export an LRC", text: "Generate the synced file from your song." },
          { title: "Match the filename", text: "Name it exactly like the audio, e.g. song.mp3 → song.lrc." },
          { title: "Place it alongside", text: "Put the .lrc in the same folder as the track." },
        ],
      },
      {
        kind: "callout",
        text: "If lyrics don't show, check the file encoding (UTF-8) and that the names match exactly — those are the usual culprits.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to add lyrics to an MP3 file", href: "/guides/how-to-add-lyrics-to-an-mp3-file" },
          { label: "Make lyrics scroll with the music", href: "/guides/make-lyrics-scroll-with-the-music" },
          { label: "Synced lyrics not showing", href: "/guides/synced-lyrics-not-showing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which players support sidecar LRC?", a: "Many desktop and mobile players do, including popular ones for foobar2000 and Android. Check your player's lyric settings." },
    ],
  },

  // 75 — scroll
  {
    slug: "guides/make-lyrics-scroll-with-the-music",
    category: "guides",
    renderType: "content",
    title: "How to make lyrics scroll with the music",
    metaTitle: "How to make lyrics scroll with the music",
    metaDescription:
      "Scrolling, time-synced lyrics need a timed file. Here's how to produce LRC or enhanced LRC so lyrics move in step with your song.",
    blocks: [
      {
        kind: "paragraph",
        text: "Lyrics that scroll in time aren't a special player trick — they come from a timed file. Make an LRC (or enhanced LRC for word-level), and any compatible player will scroll the words with the music.",
      },
      {
        kind: "steps",
        items: [
          { title: "Create a timed file", text: "Upload your song and export an LRC." },
          { title: "Pick line or word timing", text: "Enhanced LRC adds word-level scrolling." },
          { title: "Play it in a synced player", text: "The lyrics move with the track." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What are synced lyrics", href: "/guides/what-are-synced-lyrics" },
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
          { label: "Time-synced lyrics preview player", href: "/tools/synced-lyrics-preview-player" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why don't my lyrics scroll?", a: "The player needs a timed file (LRC), not plain text — and the file has to be linked to the track." },
    ],
  },

  // 76 — YouTube audio of your own song
  {
    slug: "guides/youtube-audio-to-lyrics",
    category: "guides",
    renderType: "content",
    title: "How to turn your own song's audio into lyrics",
    metaTitle: "Turn your song's audio into synced lyrics",
    metaDescription:
      "Have your own song as an audio file? Turn it into timed lyrics and every format. Upload audio you own or generated — not other artists' tracks.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you have the audio of a song you made — your own recording or an AI-generated track — you can turn it into timed lyrics in minutes. Upload the file and export the formats you need.",
      },
      {
        kind: "steps",
        items: [
          { title: "Have your own audio ready", text: "A track you own or generated." },
          { title: "Upload it", text: "The lyrics are transcribed and timed." },
          { title: "Export or publish", text: "Files, a page, or a video." },
        ],
      },
      {
        kind: "callout",
        text: "Use audio you own or generated. Don't rip other artists' songs from streaming or video sites to make lyric files.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make synced lyrics for AI-generated music", href: "/guides/make-synced-lyrics-for-ai-music" },
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I use any song from the internet?", a: "No — only audio you own or generated. Lyric files and pages aren't for other artists' copyrighted recordings." },
    ],
  },

  // 77 — subtitles for a song on YouTube
  {
    slug: "guides/make-subtitles-for-a-song-on-youtube",
    category: "guides",
    renderType: "content",
    title: "How to make subtitles for a song on YouTube",
    metaTitle: "Make subtitles for a song on YouTube",
    metaDescription:
      "Caption your music upload on YouTube. Generate an SRT from your song's lyrics and add it to the video as a subtitle track.",
    blocks: [
      {
        kind: "paragraph",
        text: "YouTube lets you upload a subtitle file to any video. For a music upload, generate an SRT from your song's lyrics and add it — viewers get accurate captions without you typing them by hand.",
      },
      {
        kind: "steps",
        items: [
          { title: "Export an SRT", text: "Upload your song and generate the subtitle file." },
          { title: "Open your video's subtitles", text: "In YouTube Studio, add subtitles for the video." },
          { title: "Upload the SRT", text: "Attach the file and review the timing." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
          { label: "Convert a song to subtitles", href: "/convert/song-to-subtitles" },
          { label: "Make captions for your AI music on YouTube", href: "/guides/captions-for-ai-music-on-youtube" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does YouTube accept SRT?", a: "Yes — you can upload an SRT subtitle file to your video in YouTube Studio." },
    ],
  },

  // 78 — TikTok/Reels
  {
    slug: "guides/time-lyrics-for-tiktok-reels",
    category: "guides",
    renderType: "content",
    title: "How to time lyrics for TikTok and Reels captions",
    metaTitle: "Time lyrics for TikTok & Reels captions",
    metaDescription:
      "Get word-timed lyrics for short-form captions. Generate a synced file from your song and use the timing for snappy TikTok or Reels text.",
    blocks: [
      {
        kind: "paragraph",
        text: "Short-form captions hit hardest when each word lands on beat. Generate word-level timing from your song, then use it to place captions that pop exactly when the lyric is sung.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the clip's song", text: "Get word-level lyric timing." },
          { title: "Export the timing", text: "Use enhanced LRC or a subtitle file." },
          { title: "Caption to the beat", text: "Place each word at its timestamp in your editor." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
          { label: "Convert a song to subtitles", href: "/convert/song-to-subtitles" },
          { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why word-level for short-form?", a: "Short clips are punchy — word-level timing lets captions snap onto each word instead of whole lines." },
    ],
  },

  // 79 — Mac
  {
    slug: "guides/make-an-lrc-file-on-mac",
    category: "guides",
    renderType: "content",
    title: "How to make an LRC file on Mac",
    metaTitle: "How to make an LRC file on Mac",
    metaDescription:
      "No Mac app to install. Make an .lrc in your browser on macOS: upload your song, auto-sync the lyrics, and download the file.",
    blocks: [
      {
        kind: "paragraph",
        text: "On a Mac you don't need to hunt for an LRC app or run anything that wasn't built for macOS — it all happens in your browser. Upload your song in Safari or Chrome and download a finished .lrc.",
      },
      {
        kind: "steps",
        items: [
          { title: "Open it in your browser", text: "Works in Safari or Chrome on macOS." },
          { title: "Upload your song", text: "Drag in an MP3, WAV or FLAC." },
          { title: "Download the LRC", text: "After the automatic sync, save the file." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to make an LRC file on Windows", href: "/guides/make-an-lrc-file-on-windows" },
          { label: "How to make an LRC file on a phone", href: "/guides/make-an-lrc-file-on-a-phone" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need to install anything on macOS?", a: "No — it runs in the browser, so there's nothing to download or set up." },
    ],
  },

  // 80 — Windows
  {
    slug: "guides/make-an-lrc-file-on-windows",
    category: "guides",
    renderType: "content",
    title: "How to make an LRC file on Windows",
    metaTitle: "How to make an LRC file on Windows",
    metaDescription:
      "Skip the desktop LRC tools. On Windows, make an .lrc in your browser: upload a song, get auto-synced lyrics, and download the file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Windows has plenty of desktop LRC editors, but most need installing and manual tapping. The browser route skips both — upload your song and the lyrics are transcribed and timed for you, then you download the .lrc.",
      },
      {
        kind: "steps",
        items: [
          { title: "Open your browser", text: "Edge, Chrome or Firefox on Windows." },
          { title: "Upload the track", text: "MP3, WAV or FLAC from your PC." },
          { title: "Save the LRC", text: "Download after the automatic sync." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Desktop LRC tools vs Syllary", href: "/compare/desktop-lrc-tools-vs-syllary" },
          { label: "How to make an LRC file on Mac", href: "/guides/make-an-lrc-file-on-mac" },
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is a desktop program better?", a: "Desktop editors give manual control, but the browser route transcribes and times automatically — usually much faster." },
    ],
  },

  // 81 — phone
  {
    slug: "guides/make-an-lrc-file-on-a-phone",
    category: "guides",
    renderType: "content",
    title: "How to make an LRC file on a phone",
    metaTitle: "How to make an LRC file on a phone",
    metaDescription:
      "Make synced lyrics from your phone — no app to install. Upload a song in your mobile browser, auto-sync, and download the .lrc.",
    blocks: [
      {
        kind: "paragraph",
        text: "You don't need a dedicated app to make an LRC on your phone. Open the site in your mobile browser, upload a song from your files, and download the finished .lrc when the automatic sync is done.",
      },
      {
        kind: "steps",
        items: [
          { title: "Open your mobile browser", text: "On iOS or Android — no app required." },
          { title: "Upload a song", text: "Pick an audio file from your phone." },
          { title: "Download the LRC", text: "Save the file to your device." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to make an LRC file on Mac", href: "/guides/make-an-lrc-file-on-mac" },
          { label: "How to make an LRC file on Windows", href: "/guides/make-an-lrc-file-on-windows" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will big files upload on mobile data?", a: "They can, but Wi-Fi is steadier for larger audio files. A typical song uploads quickly." },
    ],
  },

  // 82 — without typing
  {
    slug: "guides/make-synced-lyrics-without-typing",
    category: "guides",
    renderType: "content",
    title: "How to make synced lyrics without typing them out",
    metaTitle: "Make synced lyrics without typing them",
    metaDescription:
      "No lyric sheet, no typing. Upload your song and the words are transcribed and timed automatically — then export every format.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you don't have the lyrics written down — common with AI-generated songs — you don't need to type them. The words are pulled from the audio and timed automatically, so you start from a finished draft.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the audio", text: "No need to paste or type lyrics." },
          { title: "Let it transcribe and time", text: "Words and timing come from the vocal." },
          { title: "Review and export", text: "Correct anything, then download." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Transcribe song lyrics from audio", href: "/guides/transcribe-song-lyrics-from-audio" },
          { label: "Sync lyrics to audio automatically", href: "/guides/how-to-sync-lyrics-to-audio-automatically" },
          { label: "Make synced lyrics for AI music", href: "/guides/make-synced-lyrics-for-ai-music" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What if I do have the lyrics?", a: "You can use them — the timing still happens automatically against your audio." },
    ],
  },

  // 83 — cover of your own song
  {
    slug: "guides/sync-lyrics-for-a-cover-of-your-song",
    category: "guides",
    renderType: "content",
    title: "How to sync lyrics for a new version of your song",
    metaTitle: "Sync lyrics for a new version of your song",
    metaDescription:
      "Re-recorded or remixed your own track? Re-time the lyrics to the new audio so the sync matches. Upload the new version and export fresh files.",
    blocks: [
      {
        kind: "paragraph",
        text: "A new version of your own song — a re-record, acoustic take or remix — sings the words at different moments, so the old timing won't fit. Upload the new audio to generate sync that matches it exactly.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload the new version", text: "Your own re-recorded or remixed track." },
          { title: "Get fresh timing", text: "The lyrics are re-synced to the new audio." },
          { title: "Export updated files", text: "New LRC/TTML/SRT that match this version." },
        ],
      },
      {
        kind: "callout",
        text: "This is for new versions of your own songs. Don't make lyric files for covers of other artists' copyrighted work.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Prepare synced lyrics for distribution", href: "/guides/prepare-synced-lyrics-for-distribution" },
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can't I reuse the old LRC?", a: "Only if the timing matches. A new version usually shifts when words land, so re-syncing to the new audio is safer." },
    ],
  },

  // 84 — album bulk
  {
    slug: "guides/create-lyrics-files-for-an-album",
    category: "guides",
    renderType: "content",
    title: "How to create lyrics files for an album in bulk",
    metaTitle: "Create lyrics files for an album in bulk",
    metaDescription:
      "Doing a whole album? Organize by artist and album, process each track, and export every lyric file per song — without starting from scratch each time.",
    blocks: [
      {
        kind: "paragraph",
        text: "For a full album, you don't want to repeat the same setup ten times. Organize your tracks by artist and album, then process each one and export its files — everything stays grouped and easy to manage.",
      },
      {
        kind: "steps",
        items: [
          { title: "Set up the album", text: "Create the artist and album to group tracks." },
          { title: "Add each track", text: "Upload songs into the album." },
          { title: "Export per song", text: "Get the lyric files for every track." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Import an album and add lyrics", href: "/guides/import-an-album-and-add-lyrics" },
          { label: "Organize your AI music by artist/album", href: "/guides/organize-your-ai-music" },
          { label: "Lyric video for your AI album", href: "/guides/lyric-video-for-your-ai-album" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I keep tracks grouped?", a: "Yes — organize by artist and album so an entire release stays together." },
    ],
  },

  // 85 — import album
  {
    slug: "guides/import-an-album-and-add-lyrics",
    category: "guides",
    renderType: "content",
    title: "How to import an album and add lyrics",
    metaTitle: "Import an album and add lyrics",
    metaDescription:
      "Import an album's track list, then upload your own audio per track and let lyrics, links and more fill in automatically.",
    blocks: [
      {
        kind: "paragraph",
        text: "Setting up an album by hand is tedious. Import the album's track list to scaffold everything, then upload your own audio for each track — the lyrics, summary, links and cover can be generated from there.",
      },
      {
        kind: "steps",
        items: [
          { title: "Import the album", text: "Pull in the track list to set up the release." },
          { title: "Upload your audio per track", text: "Add the file for each song you own." },
          { title: "Let the rest fill in", text: "Lyrics, links and more are generated automatically." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Create lyrics files for an album", href: "/guides/create-lyrics-files-for-an-album" },
          { label: "Organize your AI music by artist/album", href: "/guides/organize-your-ai-music" },
          { label: "Find streaming links for your song", href: "/guides/find-streaming-links-for-your-song" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I still upload my own audio?", a: "Yes — importing sets up the track list; you provide the audio for each track you own." },
    ],
  },

  // 86 — song summary
  {
    slug: "guides/generate-a-song-summary",
    category: "guides",
    renderType: "content",
    title: "How to generate a song summary or description",
    metaTitle: "Generate a song summary or description",
    metaDescription:
      "Need a short description of your song for a page or release notes? Generate a summary, themes and mood from the lyrics in seconds.",
    blocks: [
      {
        kind: "paragraph",
        text: "A tidy description helps a release page, catalog entry or pitch. From your song's lyrics you can generate a short summary, a few theme tags and the overall mood — no copywriting required.",
      },
      {
        kind: "steps",
        items: [
          { title: "Have the lyrics ready", text: "From your uploaded song or pasted text." },
          { title: "Generate the summary", text: "Get a short description, themes and mood." },
          { title: "Use it anywhere", text: "Your page, release notes or catalog metadata." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Song summary generator", href: "/tools/song-summary-generator" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
          { label: "Find the chorus", href: "/tools/find-the-chorus" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Where does the summary come from?", a: "It's generated from your song's lyrics — a neutral description plus themes and a one-line mood." },
    ],
  },

  // 87 — cover image
  {
    slug: "guides/auto-generate-a-cover-image",
    category: "guides",
    renderType: "content",
    title: "How to auto-generate a cover image for a song",
    metaTitle: "Auto-generate a cover image for a song",
    metaDescription:
      "Make a square cover for your own or AI song from a description. Generate artwork in seconds, with a standard or premium quality option.",
    blocks: [
      {
        kind: "paragraph",
        text: "A release needs a cover. Describe the vibe — mood, colors, subject — and generate a square cover image for your own or AI-generated song, with a quick standard option or a higher-quality one.",
      },
      {
        kind: "steps",
        items: [
          { title: "Describe the cover", text: "Mood, colors and subject in a sentence." },
          { title: "Pick a quality", text: "A fast standard option or a premium one." },
          { title: "Generate and use it", text: "Attach it to your song or album." },
        ],
      },
      {
        kind: "callout",
        text: "Make covers for your own or AI-generated songs. Don't recreate a famous album's artwork.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Generate a song summary", href: "/guides/generate-a-song-summary" },
          { label: "Turn your Suno song into a full lyrics page", href: "/guides/suno-song-to-full-lyrics-page" },
          { label: "Find streaming links for your song", href: "/guides/find-streaming-links-for-your-song" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is the cover mine to use?", a: "It's generated for your own or AI song. Don't copy copyrighted artwork or a famous cover." },
    ],
  },

  // 88 — streaming links
  {
    slug: "guides/find-streaming-links-for-your-song",
    category: "guides",
    renderType: "content",
    title: "How to find streaming links for your song",
    metaTitle: "Find streaming links for your song",
    metaDescription:
      "Gather your song's links across Spotify, Apple Music, YouTube and more — from a title and artist, or a single link — and attach them to your page.",
    blocks: [
      {
        kind: "paragraph",
        text: "Once your song is out, you'll want its links in one place. From a title and artist — or one link you already have — you can gather the matching links across the major platforms and add them to your public page.",
      },
      {
        kind: "steps",
        items: [
          { title: "Enter the song", text: "Title and artist, or paste one streaming link." },
          { title: "Gather the links", text: "Matching links across the major platforms." },
          { title: "Add them to your page", text: "Listeners get every platform in one spot." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Streaming link finder", href: "/tools/streaming-link-finder" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
          { label: "Make a lyrics page with streaming links", href: "/guides/lyrics-page-with-streaming-links" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need a link to start?", a: "No — a title and artist is enough, though pasting an existing link improves the match." },
    ],
  },

  // 89 — section labels
  {
    slug: "guides/label-song-sections-automatically",
    category: "guides",
    renderType: "content",
    title: "How to label song sections automatically",
    metaTitle: "Label song sections (verse/chorus) automatically",
    metaDescription:
      "Get verse, chorus and bridge labels on your lyrics automatically — useful for structure, editing and finding the hook.",
    blocks: [
      {
        kind: "paragraph",
        text: "Knowing where the verse, chorus and bridge fall helps with editing, video pacing and finding the hook. The sections of your lyrics can be labeled automatically, so you see the song's structure at a glance.",
      },
      {
        kind: "steps",
        items: [
          { title: "Start from your lyrics", text: "Your uploaded song or pasted text." },
          { title: "Sections are labeled", text: "Verse, chorus, bridge and more." },
          { title: "Use the structure", text: "For editing, the chorus, or video pacing." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Find the chorus", href: "/tools/find-the-chorus" },
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
          { label: "Generate a song summary", href: "/guides/generate-a-song-summary" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can it find the chorus?", a: "Yes — section labeling identifies the chorus and other parts from repeated lines and structure." },
    ],
  },

  // 90 — export all
  {
    slug: "guides/export-every-lyrics-format-at-once",
    category: "guides",
    renderType: "content",
    title: "How to export every lyrics format at once",
    metaTitle: "Export every lyrics format at once",
    metaDescription:
      "One upload, every format. Export LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON together — no re-doing the work for each one.",
    blocks: [
      {
        kind: "paragraph",
        text: "The whole point of timing your lyrics once is reusing that work everywhere. From a single upload you can export all seven formats together — players, streaming, video and data — instead of redoing each separately.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "LRC and enhanced LRC — music players and karaoke",
          "TTML — Apple Music via your distributor",
          "SRT and VTT — video captions",
          "TXT — a plain lyric sheet",
          "JSON — structured data for apps",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
          { label: "Lyric files for streaming platforms", href: "/guides/lyric-files-for-streaming-platforms" },
          { label: "Lyrics format converter", href: "/tools/lyrics-format-converter" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I have to pick a format upfront?", a: "No — time the lyrics once and export every format together, then use whichever each destination needs." },
    ],
  },
];
