import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 3 — Format & "What is" reference pages (#91–110).
// "What is" pages open with a definition block (DefinedTerm JSON-LD + a crisp
// snippet). Format-comparison pages use a table. All under /guides/.

const cta = UNIVERSAL_CTA;

export const FORMAT_PAGES: SeedPage[] = [
  // 91 — what is an LRC file
  {
    slug: "guides/what-is-an-lrc-file",
    category: "guides",
    renderType: "content",
    title: "What is an LRC file?",
    metaTitle: "What is an LRC file?",
    metaDescription:
      "An LRC file is plain-text lyrics with a timestamp on each line. Learn its structure, where it's used, and how to make one from a song.",
    blocks: [
      {
        kind: "definition",
        term: "An LRC file",
        text: "is a plain-text lyrics file with a timestamp on each line, so a music player can highlight the words in time with the song.",
      },
      {
        kind: "paragraph",
        text: "It's the universal standard for synced lyrics in music players and karaoke software. The format is simple: each line begins with a time in brackets, followed by the words sung at that moment.",
      },
      {
        kind: "code",
        code: "[00:12.34] [your first line]\n[00:16.80] [your next line]",
        caption: "The [mm:ss.xx] tag marks when the line is sung.",
      },
      {
        kind: "heading", level: 2, text: "Where LRC is used",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Music players that show scrolling, synced lyrics",
          "Karaoke apps",
          "Local-file lyrics (an .lrc next to your audio)",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
          { label: "LRC timestamp format explained", href: "/guides/lrc-timestamp-format-explained" },
          { label: "What is enhanced LRC", href: "/guides/what-is-enhanced-lrc" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is an LRC just a text file?", a: "Yes — it's plain text with timestamps, so you can open it in any text editor." },
      { q: "Can I make one without typing timestamps?", a: "Yes — upload your song and the lines are timed automatically." },
    ],
  },

  // 92 — enhanced LRC
  {
    slug: "guides/what-is-enhanced-lrc",
    category: "guides",
    renderType: "content",
    title: "What is enhanced LRC?",
    metaTitle: "What is enhanced LRC?",
    metaDescription:
      "Enhanced LRC adds a timestamp to each word, not just each line — the format behind karaoke word-by-word highlighting. Here's how it works.",
    blocks: [
      {
        kind: "definition",
        term: "Enhanced LRC",
        text: "is an LRC variant that times each word inside a line, using inline tags — enabling word-by-word karaoke highlighting.",
      },
      {
        kind: "paragraph",
        text: "A standard LRC times whole lines; enhanced LRC goes finer, marking when each word begins. Players that support it can light up the lyrics word by word as they're sung.",
      },
      {
        kind: "code",
        code: "[00:12.00]<00:12.00>[word] <00:12.50>[word] <00:13.10>[word]",
        caption: "Each <mm:ss.xx> tag inside the line times a single word.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
          { label: "Line-level vs word-level sync", href: "/guides/line-level-vs-word-level-sync" },
          { label: "Make an enhanced LRC file", href: "/guides/how-to-make-an-enhanced-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do all players support enhanced LRC?", a: "Many do; those that don't fall back to line-level timing, so the file still works." },
    ],
  },

  // 93 — TTML
  {
    slug: "guides/what-is-a-ttml-file",
    category: "guides",
    renderType: "content",
    title: "What is a TTML file?",
    metaTitle: "What is a TTML file?",
    metaDescription:
      "TTML (Timed Text Markup Language) is the XML-based format Apple Music uses for time-synced lyrics. Learn what it is and when you need it.",
    blocks: [
      {
        kind: "definition",
        term: "A TTML file",
        text: "is an XML-based timed-text format. Apple Music uses it for time-synced lyrics, delivered through your distributor.",
      },
      {
        kind: "paragraph",
        text: "Where LRC is lightweight plain text, TTML is a richer, structured format built for streaming-grade synced lyrics. It can carry line and word timing and is the format Apple's lyric system expects.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "LRC vs TTML", href: "/guides/lrc-vs-ttml" },
          { label: "What format does Apple Music use", href: "/guides/what-format-does-apple-music-use-for-lyrics" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I upload TTML to Apple myself?", a: "Generally no — your distributor delivers the TTML to Apple Music on your behalf." },
    ],
  },

  // 94 — SRT
  {
    slug: "guides/what-is-an-srt-file",
    category: "guides",
    renderType: "content",
    title: "What is an SRT file?",
    metaTitle: "What is an SRT file?",
    metaDescription:
      "An SRT (SubRip) file is the standard subtitle format for video. Learn its structure and how it differs from a music lyrics file.",
    blocks: [
      {
        kind: "definition",
        term: "An SRT file",
        text: "is the SubRip subtitle format: numbered cues, each with a start and end time and the text shown during that window.",
      },
      {
        kind: "paragraph",
        text: "SRT is the most widely accepted subtitle format in video editors. For songs, it captions lyrics on a video — but unlike LRC, it's built around video cues rather than a music player's lyric display.",
      },
      {
        kind: "code",
        code: "1\n00:00:12,340 --> 00:00:16,800\n[your lyric line]",
        caption: "A cue: index, start --> end, then the line.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC vs SRT", href: "/guides/lrc-vs-srt" },
          { label: "SRT vs VTT", href: "/guides/srt-vs-vtt" },
          { label: "Make an SRT file from a song", href: "/guides/how-to-make-an-srt-file-from-a-song" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I use an SRT in a music player?", a: "Players prefer LRC; SRT is for video. Convert an SRT to LRC if you need it in a player." },
    ],
  },

  // 95 — VTT
  {
    slug: "guides/what-is-a-vtt-file",
    category: "guides",
    renderType: "content",
    title: "What is a VTT (WebVTT) file?",
    metaTitle: "What is a VTT (WebVTT) file?",
    metaDescription:
      "WebVTT (.vtt) is the web-native caption format for HTML5 video. Learn what it is and how it compares to SRT.",
    blocks: [
      {
        kind: "definition",
        term: "A VTT file",
        text: "(WebVTT) is the web-native caption format read by HTML5 video players for subtitles and captions.",
      },
      {
        kind: "paragraph",
        text: "VTT is close to SRT but designed for the web, with a WEBVTT header and a few styling capabilities. It's the format to use when captioning a song on a webpage.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "SRT vs VTT", href: "/guides/srt-vs-vtt" },
          { label: "Make a VTT file from a song", href: "/guides/how-to-make-a-vtt-file-from-a-song" },
          { label: "Embed lyrics on your website", href: "/guides/embed-lyrics-on-your-website" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "VTT or SRT for the web?", a: "VTT is the web-native choice for HTML5 video; SRT is more common in desktop editors." },
    ],
  },

  // 96 — JSON
  {
    slug: "guides/what-is-a-json-lyrics-file",
    category: "guides",
    renderType: "content",
    title: "What is a JSON lyrics file?",
    metaTitle: "What is a JSON lyrics file?",
    metaDescription:
      "A JSON lyrics file is structured, machine-readable timed lyrics — lines, words and timestamps as data for developers and apps.",
    blocks: [
      {
        kind: "definition",
        term: "A JSON lyrics file",
        text: "is timed lyrics expressed as structured data — lines, words and timestamps in a machine-readable format for developers.",
      },
      {
        kind: "paragraph",
        text: "Where LRC and SRT are made to be displayed, JSON is made to be parsed. It's the right choice when an app or pipeline needs to read the timing programmatically rather than show it.",
      },
      {
        kind: "callout",
        text: "JSON is an output you generate from a song, not a converter input — nobody arrives holding a JSON lyrics file to convert.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a JSON timed-lyrics file", href: "/guides/how-to-make-a-json-lyrics-file" },
          { label: "Export every lyrics format at once", href: "/guides/export-every-lyrics-format-at-once" },
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why use JSON over LRC?", a: "Use JSON when code needs to read the data; use LRC when a player needs to display it." },
    ],
  },

  // 97 — LRC vs SRT
  {
    slug: "guides/lrc-vs-srt",
    category: "guides",
    renderType: "content",
    title: "LRC vs SRT: which to use",
    metaTitle: "LRC vs SRT: which should you use?",
    metaDescription:
      "LRC is for music players; SRT is for video subtitles. Here's the difference and when to use each — plus how to convert between them.",
    blocks: [
      {
        kind: "paragraph",
        text: "LRC and SRT both carry timed text, but they live in different worlds. LRC drives lyrics in music players; SRT captions video. Pick by where the file is going.",
      },
      {
        kind: "table",
        headers: ["", "LRC", "SRT"],
        rows: [
          ["Built for", "Music players, karaoke", "Video subtitles"],
          ["Timing", "Line start (enhanced: per word)", "Start and end per cue"],
          ["Where it shows", "Player lyric display", "On-screen captions"],
          ["Best when", "Local files, players", "Videos and editors"],
        ],
      },
      {
        kind: "paragraph",
        text: "Need both? Time the lyrics once and export each, or convert an existing file from one to the other.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC to SRT converter", href: "/convert/lrc-to-srt" },
          { label: "SRT to LRC converter", href: "/convert/srt-to-lrc" },
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can one file do both jobs?", a: "Not well — players expect LRC and video tools expect SRT. It's easy to convert between them, though." },
    ],
  },

  // 98 — LRC vs TTML (migrated from compare/lrc-vs-ttml)
  {
    slug: "guides/lrc-vs-ttml",
    category: "guides",
    renderType: "content",
    title: "LRC vs TTML: which synced-lyrics format do you need?",
    metaTitle: "LRC vs TTML: which do you need?",
    metaDescription:
      "LRC and TTML both carry timed lyrics, but they're built for different places. A plain comparison so you pick the right one.",
    blocks: [
      {
        kind: "paragraph",
        text: "Both LRC and TTML store lyrics with timing, but they serve different homes. LRC is the lightweight standard for music players and local synced lyrics; TTML is the richer, XML-based format used for streaming-grade synced lyrics like Apple Music's.",
      },
      {
        kind: "table",
        headers: ["", "LRC", "TTML"],
        rows: [
          ["Format", "Plain text", "XML"],
          ["Best for", "Music players, local files", "Streaming-grade synced lyrics"],
          ["Word-level timing", "Enhanced LRC only", "Yes"],
          ["Readability", "Very simple", "More verbose"],
        ],
      },
      {
        kind: "paragraph",
        text: "The good news: you don't have to choose up front. From one timed-lyrics source you can export both — and every other format you might need.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC to TTML converter", href: "/convert/lrc-to-ttml" },
          { label: "What is a TTML file", href: "/guides/what-is-a-ttml-file" },
          { label: "TTML vs LRC vs SRT", href: "/guides/ttml-vs-lrc-vs-srt" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which does Apple Music use?", a: "Apple Music uses TTML, delivered through your distributor. LRC is for players and local files." },
    ],
  },

  // 99 — SRT vs VTT
  {
    slug: "guides/srt-vs-vtt",
    category: "guides",
    renderType: "content",
    title: "SRT vs VTT: the difference",
    metaTitle: "SRT vs VTT: what's the difference?",
    metaDescription:
      "SRT and VTT are both subtitle formats — one for editors, one for the web. Here's the difference and when to use each.",
    blocks: [
      {
        kind: "paragraph",
        text: "SRT and VTT are siblings: both caption video with timed cues. The split is mostly about where they're used — SRT in desktop editors and broadly, VTT natively on the web.",
      },
      {
        kind: "table",
        headers: ["", "SRT", "VTT"],
        rows: [
          ["Home", "Editors, broad support", "Web (HTML5 video)"],
          ["Header", "None", "WEBVTT"],
          ["Styling", "Minimal", "Some web styling"],
          ["Use when", "Desktop editing", "Captioning on a webpage"],
        ],
      },
      {
        kind: "paragraph",
        text: "They're easy to convert between, so pick whichever your destination prefers and switch if needed.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "SRT to VTT converter", href: "/convert/srt-to-vtt" },
          { label: "VTT to SRT converter", href: "/convert/vtt-to-srt" },
          { label: "What is a VTT file", href: "/guides/what-is-a-vtt-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Are they interchangeable?", a: "Almost — the syntax differs slightly, so convert rather than rename the file extension." },
    ],
  },

  // 100 — three-way
  {
    slug: "guides/ttml-vs-lrc-vs-srt",
    category: "guides",
    renderType: "content",
    title: "TTML vs LRC vs SRT",
    metaTitle: "TTML vs LRC vs SRT compared",
    metaDescription:
      "Three timed-text formats, three jobs: streaming lyrics, music-player lyrics, and video subtitles. Here's which is which.",
    blocks: [
      {
        kind: "paragraph",
        text: "These three come up together because they all time text — but each has a clear home. TTML is for streaming lyrics (Apple Music), LRC for music players, and SRT for video subtitles.",
      },
      {
        kind: "table",
        headers: ["", "TTML", "LRC", "SRT"],
        rows: [
          ["Primary use", "Streaming lyrics", "Player lyrics", "Video subtitles"],
          ["Format", "XML", "Plain text", "Plain text"],
          ["Word-level", "Yes", "Enhanced only", "No"],
          ["Delivered via", "Distributor", "File / sidecar", "Editor / upload"],
        ],
      },
      {
        kind: "paragraph",
        text: "Time once, export all three — then send each where it belongs.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC vs TTML", href: "/guides/lrc-vs-ttml" },
          { label: "LRC vs SRT", href: "/guides/lrc-vs-srt" },
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need all three?", a: "Only the ones your destinations use — but exporting all three keeps you ready for any of them." },
    ],
  },

  // 101 — line vs word
  {
    slug: "guides/line-level-vs-word-level-sync",
    category: "guides",
    renderType: "content",
    title: "Line-level vs word-level sync",
    metaTitle: "Line-level vs word-level lyric sync",
    metaDescription:
      "Line-level sync times each line; word-level times each word. Here's the difference and when karaoke-style word timing matters.",
    blocks: [
      {
        kind: "definition",
        term: "Lyric sync granularity",
        text: "is how finely lyrics are timed — line-level marks when each line starts, while word-level marks when each individual word is sung.",
      },
      {
        kind: "paragraph",
        text: "Line-level is enough for most players showing scrolling lyrics. Word-level is what enables the karaoke effect, where each word lights up as it's sung. Enhanced LRC and TTML can store word-level timing.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is enhanced LRC", href: "/guides/what-is-enhanced-lrc" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
          { label: "What is lyric synchronization", href: "/guides/what-is-lyric-synchronization" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which should I use?", a: "Line-level for general players; word-level when you want karaoke highlighting. You can export both." },
    ],
  },

  // 102 — synced vs unsynced
  {
    slug: "guides/synced-vs-unsynced-lyrics",
    category: "guides",
    renderType: "content",
    title: "Synced vs unsynced lyrics",
    metaTitle: "Synced vs unsynced lyrics",
    metaDescription:
      "Synced lyrics are timed to the music; unsynced are just the words. Here's why timed lyrics matter for engagement, karaoke and accessibility.",
    blocks: [
      {
        kind: "definition",
        term: "Synced lyrics",
        text: "are timed to the audio so they appear in step with the song; unsynced lyrics are just the words, with no timing.",
      },
      {
        kind: "paragraph",
        text: "Unsynced lyrics are fine for reading. Synced lyrics do more: they highlight as the song plays, power karaoke, help accessibility, and keep listeners engaged on streaming and player screens.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What are synced lyrics", href: "/guides/what-are-synced-lyrics" },
          { label: "How to sync lyrics to audio automatically", href: "/guides/how-to-sync-lyrics-to-audio-automatically" },
          { label: "Make lyrics scroll with the music", href: "/guides/make-lyrics-scroll-with-the-music" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do streaming platforms prefer synced lyrics?", a: "Synced lyrics are what platforms highlight during playback; plain lyrics don't move with the song." },
    ],
  },

  // 103 — what are synced lyrics
  {
    slug: "guides/what-are-synced-lyrics",
    category: "guides",
    renderType: "content",
    title: "What are synced lyrics?",
    metaTitle: "What are synced lyrics?",
    metaDescription:
      "Synced lyrics are lyrics timed to the music, so the right line shows at the right moment. Here's where you see them and how they're made.",
    blocks: [
      {
        kind: "definition",
        term: "Synced lyrics",
        text: "are lyrics with timing attached, so a player or app shows each line — or word — exactly when it's sung.",
      },
      {
        kind: "paragraph",
        text: "You've seen them as the scrolling, highlighting lyrics on streaming apps and music players. Behind the scenes, they're a timed file (like LRC or TTML) that pairs each line with a moment in the song.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Synced vs unsynced lyrics", href: "/guides/synced-vs-unsynced-lyrics" },
          { label: "What is lyric synchronization", href: "/guides/what-is-lyric-synchronization" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How are synced lyrics made?", a: "By timing each line to the audio — by hand, or automatically by uploading the song." },
    ],
  },

  // 104 — karaoke file
  {
    slug: "guides/what-is-a-karaoke-lyrics-file",
    category: "guides",
    renderType: "content",
    title: "What is a karaoke lyrics file?",
    metaTitle: "What is a karaoke lyrics file?",
    metaDescription:
      "Karaoke lyric files highlight words as they're sung. Learn how karaoke formats work and how timed lyrics map to a sing-along experience.",
    blocks: [
      {
        kind: "definition",
        term: "A karaoke lyrics file",
        text: "stores lyrics with word-level timing so a player can highlight each word as it's sung, guiding a sing-along.",
      },
      {
        kind: "paragraph",
        text: "Classic karaoke formats are built around this highlight-as-sung idea. Word-timed lyrics — like enhanced LRC — capture the same information and drive a karaoke-style display in players and on a public page.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make karaoke lyrics from a song", href: "/guides/make-karaoke-lyrics-from-a-song" },
          { label: "What is enhanced LRC", href: "/guides/what-is-enhanced-lrc" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I make a karaoke file from my song?", a: "Yes, for your own or AI-generated songs — upload the track and export word-timed lyrics or publish a karaoke page." },
    ],
  },

  // 105 — lyric synchronization
  {
    slug: "guides/what-is-lyric-synchronization",
    category: "guides",
    renderType: "content",
    title: "What is lyric synchronization?",
    metaTitle: "What is lyric synchronization (timing)?",
    metaDescription:
      "Lyric synchronization is aligning each word to the audio timeline. Here's the core idea and how it's done automatically.",
    blocks: [
      {
        kind: "definition",
        term: "Lyric synchronization",
        text: "is the process of aligning lyrics to the audio timeline — attaching a moment to each line (and often each word) so they display in time.",
      },
      {
        kind: "paragraph",
        text: "It's the engine under everything else: synced files, karaoke, lyric videos and streaming lyrics all start from accurate timing. Done automatically, the words are matched to when they're sung, then refined.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to time lyrics to music", href: "/guides/how-to-time-lyrics-to-music" },
          { label: "Line-level vs word-level sync", href: "/guides/line-level-vs-word-level-sync" },
          { label: "What are synced lyrics", href: "/guides/what-are-synced-lyrics" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is synchronization the same as transcription?", a: "No — transcription gets the words; synchronization attaches the timing. Both happen when you upload a song." },
    ],
  },

  // 106 — LRC metadata tags
  {
    slug: "guides/lrc-metadata-tags-explained",
    category: "guides",
    renderType: "content",
    title: "LRC metadata tags explained",
    metaTitle: "LRC metadata tags explained",
    metaDescription:
      "LRC files can hold metadata tags like title, artist, album and offset. Here's what each tag does and where it goes.",
    blocks: [
      {
        kind: "paragraph",
        text: "Beyond timed lines, an LRC can include a few metadata tags at the top — handy details a player may show or use. They're optional, but worth knowing.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "[ti:] — the song title",
          "[ar:] — the artist",
          "[al:] — the album",
          "[by:] — who made the LRC",
          "[offset:] — shift all timestamps by a number of milliseconds",
        ],
      },
      {
        kind: "callout",
        text: "The [offset:] tag is the practical one: a positive or negative value nudges every line earlier or later without re-timing.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC timestamp format explained", href: "/guides/lrc-timestamp-format-explained" },
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Are metadata tags required?", a: "No — only the timed lines are essential. Tags like title and artist are optional extras." },
    ],
  },

  // 107 — LRC timestamp format
  {
    slug: "guides/lrc-timestamp-format-explained",
    category: "guides",
    renderType: "content",
    title: "LRC timestamp format explained",
    metaTitle: "LRC timestamp format explained",
    metaDescription:
      "The LRC timestamp is [mm:ss.xx] — minutes, seconds, and hundredths. Here's how it's read, with the common variations.",
    blocks: [
      {
        kind: "definition",
        term: "An LRC timestamp",
        text: "looks like [mm:ss.xx] — minutes, seconds, and hundredths of a second — marking when a line begins.",
      },
      {
        kind: "paragraph",
        text: "It sits at the start of each line, in square brackets. Some files use three-digit milliseconds or a colon before the fraction; the two-digit hundredths form is the most widely supported.",
      },
      {
        kind: "code",
        code: "[00:12.34] [your lyric line]",
        caption: "Minutes : seconds . hundredths.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC metadata tags explained", href: "/guides/lrc-metadata-tags-explained" },
          { label: "LRC validator/checker", href: "/tools/lrc-validator" },
          { label: "What is an LRC file", href: "/guides/what-is-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Two-digit or three-digit fractions?", a: "Both exist; two-digit hundredths is the most compatible. A validator can flag a malformed timestamp." },
    ],
  },

  // 108 — Spotify format
  {
    slug: "guides/what-format-does-spotify-use-for-lyrics",
    category: "guides",
    renderType: "content",
    title: "What file format does Spotify use for lyrics?",
    metaTitle: "What format does Spotify use for lyrics?",
    metaDescription:
      "Spotify doesn't take a direct LRC upload — it shows synced lyrics sourced through Musixmatch. Here's how to get your lyrics there.",
    blocks: [
      {
        kind: "paragraph",
        text: "Short answer: there's no LRC you upload to Spotify. Spotify displays synced lyrics sourced through Musixmatch. So the \"format\" question is really a workflow question — prepare accurate, timed lyrics, then submit them through Musixmatch after your track is live.",
      },
      {
        kind: "callout",
        text: "Spotify and Musixmatch update their steps over time — check their current guidance before submitting.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Add synced lyrics to Spotify", href: "/guides/how-to-add-synced-lyrics-to-spotify" },
          { label: "Musixmatch vs Syllary", href: "/compare/musixmatch-vs-syllary" },
          { label: "Which lyrics format should I use", href: "/guides/which-lyrics-format-should-i-use" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I upload an LRC to Spotify?", a: "No — Spotify pulls synced lyrics via Musixmatch rather than accepting a direct lyric-file upload." },
    ],
  },

  // 109 — Apple format
  {
    slug: "guides/what-format-does-apple-music-use-for-lyrics",
    category: "guides",
    renderType: "content",
    title: "What file format does Apple Music use for lyrics?",
    metaTitle: "What format does Apple Music use for lyrics?",
    metaDescription:
      "Apple Music uses TTML for time-synced lyrics, delivered by your distributor. Here's what that means and how to produce the file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Apple Music's time-synced lyrics come from a TTML file. You don't upload it to Apple directly — your distributor delivers it with your release. The timing has to match the exact master you ship.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "What is a TTML file", href: "/guides/what-is-a-ttml-file" },
          { label: "Add synced lyrics to Apple Music", href: "/guides/how-to-add-synced-lyrics-to-apple-music" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Why does the version matter?", a: "Different masters sing the words at slightly different times, so the TTML timing must match the exact release audio." },
    ],
  },

  // 110 — which format
  {
    slug: "guides/which-lyrics-format-should-i-use",
    category: "guides",
    renderType: "content",
    title: "Which lyrics format should I use?",
    metaTitle: "Which lyrics format should I use?",
    metaDescription:
      "A quick decision guide: pick the right lyrics format by goal — music player, Spotify, Apple Music, video captions, or developer data.",
    blocks: [
      {
        kind: "paragraph",
        text: "The right format depends on where the lyrics are going. Here's the short version — and since you can export everything from one upload, you don't have to choose just one.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Music player or local files → LRC (enhanced LRC for karaoke)",
          "Apple Music → TTML (via your distributor)",
          "Spotify → prepare timed lyrics, submit via Musixmatch after release",
          "Video captions → SRT (editors) or VTT (web)",
          "Apps and code → JSON",
          "A printable sheet → TXT",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Export every lyrics format at once", href: "/guides/export-every-lyrics-format-at-once" },
          { label: "TTML vs LRC vs SRT", href: "/guides/ttml-vs-lrc-vs-srt" },
          { label: "Lyric files for streaming platforms", href: "/guides/lyric-files-for-streaming-platforms" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I just export everything?", a: "Yes — time the lyrics once and export all formats, then use whichever each destination needs." },
    ],
  },
];
