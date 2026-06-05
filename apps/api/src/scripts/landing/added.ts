import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 6 — Added pages (#151–160). Net-new, distinct from all other rows.

const cta = UNIVERSAL_CTA;

export const ADDED_PAGES: SeedPage[] = [
  // 151 — which lyric video style (distinct from #65's how-to)
  {
    slug: "guides/how-to-make-a-lyric-video-for-a-song",
    category: "guides",
    renderType: "content",
    title: "How to make a lyric video for a song: which style to pick",
    metaTitle: "Make a lyric video for a song: which style?",
    metaDescription:
      "Three looks for a lyric video — words over a background, words in the scene, scenes that move. How to choose the right one for your song.",
    blocks: [
      {
        kind: "paragraph",
        text: "Before you make a lyric video, it helps to know the look you're after. There are three, in plain terms — and the right pick depends on your song and how much you want it to stand out.",
      },
      {
        kind: "table",
        headers: ["Style", "What it looks like", "Good for"],
        rows: [
          ["Words over a background", "Text on a still or simple background", "Fast, clean, classic lyric videos"],
          ["Words in the scene", "Lyrics are part of the generated image", "A more distinctive, designed look"],
          ["Scenes that move", "The scene animates with the song", "Maximum impact; the words come alive"],
        ],
      },
      {
        kind: "paragraph",
        text: "Whichever you choose, the flow is the same: upload the song, the lyrics are synced, and the video is generated. It's a visualization of the words — not a narrative film. A one-continuous-shot mode exists in early beta.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "How to make a lyric video", href: "/guides/how-to-make-a-lyric-video" },
          { label: "Make a karaoke video with words highlighted", href: "/guides/make-a-karaoke-video-with-words-highlighted" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which style is most popular?", a: "Words over a background is the classic, but words built into a moving scene is what makes a video stand out." },
    ],
  },

  // 152 — add lyrics to an MP3 file
  {
    slug: "guides/how-to-add-lyrics-to-an-mp3-file",
    category: "guides",
    renderType: "content",
    title: "How to add lyrics to an MP3 file",
    metaTitle: "How to add lyrics to an MP3 file",
    metaDescription:
      "Attach synced lyrics to an MP3 — as a matching .lrc sidecar, or by embedding the lyrics in the file's tags. Here's how to do both.",
    blocks: [
      {
        kind: "paragraph",
        text: "\"Adding lyrics to an MP3\" usually means one of two things: a separate .lrc file next to it (a sidecar), or lyrics written into the MP3's own tags. The sidecar route is what gives you synced, scrolling lyrics in most players.",
      },
      {
        kind: "steps",
        items: [
          { title: "Make a synced LRC", text: "Upload the MP3 and export a timed .lrc." },
          { title: "Match the filename", text: "Name the .lrc exactly like the MP3." },
          { title: "Keep them together", text: "Place both in the same folder; players pair them." },
        ],
      },
      {
        kind: "callout",
        text: "Embedding plain lyrics in an MP3's tags shows static words; a matching .lrc sidecar is what enables synced, scrolling lyrics.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
          { label: "Convert MP3 to LRC", href: "/convert/mp3-to-lrc" },
          { label: "Synced lyrics not showing", href: "/guides/synced-lyrics-not-showing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Sidecar or embedded?", a: "Use a matching .lrc sidecar for synced, scrolling lyrics; embedded tags only show static text." },
    ],
  },

  // 153 — translate synced lyrics
  {
    slug: "guides/how-to-translate-synced-lyrics",
    category: "guides",
    renderType: "content",
    title: "How to translate synced lyrics to another language",
    metaTitle: "Translate synced lyrics (keep the timing)",
    metaDescription:
      "Translate your lyrics while keeping the timing. Export the timed file, translate the lines, and re-import so the timestamps stay aligned.",
    blocks: [
      {
        kind: "paragraph",
        text: "Translating synced lyrics is about keeping the timing while swapping the words. The trick is to keep the line structure intact: export the timed file, translate each line in place, and bring it back so the timestamps still line up.",
      },
      {
        kind: "steps",
        items: [
          { title: "Export the timed file", text: "Get your synced lyrics for the song." },
          { title: "Translate line by line", text: "Replace each line's text, keeping the lines aligned." },
          { title: "Re-import the lyrics", text: "Keep the timestamps so the new text stays synced." },
        ],
      },
      {
        kind: "callout",
        text: "Keep one translated line per original line so the timing maps cleanly. This is a workflow for your own or AI songs.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
          { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
          { label: "How to make an LRC file", href: "/guides/how-to-make-an-lrc-file" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will the timing still match?", a: "Yes, as long as you keep the same number of lines — each translated line inherits the original's timing." },
    ],
  },

  // 154 — karaoke video with words highlighted
  {
    slug: "guides/make-a-karaoke-video-with-words-highlighted",
    category: "guides",
    renderType: "content",
    title: "How to make a karaoke video with words highlighted",
    metaTitle: "Karaoke video with words highlighted",
    metaDescription:
      "Make a karaoke-style video where each word highlights as it's sung. Upload your own or AI song, get word-level timing, and generate the video.",
    blocks: [
      {
        kind: "paragraph",
        text: "A karaoke video lights up each word as it's sung so people can follow along. For your own or AI song, upload the track, get word-level timing, and generate a video with the lyrics highlighting in time.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your own/AI song", text: "Karaoke output is for songs you own or generated." },
          { title: "Get word-level timing", text: "Each word is timed for highlight-as-sung." },
          { title: "Generate the video", text: "The words highlight as the song plays." },
        ],
      },
      {
        kind: "callout",
        text: "Make karaoke videos for your own or AI-generated songs only — not someone else's copyrighted recording.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make karaoke lyrics from a song", href: "/guides/make-karaoke-lyrics-from-a-song" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
          { label: "How to make a lyric video", href: "/guides/how-to-make-a-lyric-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is this different from a lyric video?", a: "A bit — a karaoke video emphasizes highlight-as-sung word timing so viewers can sing along precisely." },
    ],
  },

  // 155 — what is an ASS subtitle file
  {
    slug: "guides/what-is-an-ass-subtitle-file",
    category: "guides",
    renderType: "content",
    title: "What is an ASS subtitle file (and do you need one)?",
    metaTitle: "What is an ASS subtitle file?",
    metaDescription:
      "ASS is a heavily-styled video subtitle format with karaoke tags. Learn what it is, when it's used, and why Syllary points you to LRC/SRT/VTT instead.",
    blocks: [
      {
        kind: "definition",
        term: "An ASS file",
        text: "(Advanced SubStation Alpha) is a heavily-styled video subtitle format with control over fonts, colors, position and built-in karaoke timing tags.",
      },
      {
        kind: "paragraph",
        text: "ASS comes from the anime-fansub world and is native to the Aegisub editor. It exists to burn richly-styled karaoke text into a video. It's a video-overlay format, not something streaming or distribution platforms want.",
      },
      {
        kind: "callout",
        text: "Syllary doesn't export ASS. Our karaoke styling lives in our own player and scene-based videos, so we focus on the formats distribution uses — LRC, TTML, SRT and VTT.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "What is an SRT file", href: "/guides/what-is-an-srt-file" },
          { label: "What is a VTT file", href: "/guides/what-is-a-vtt-file" },
          { label: "Make a karaoke video with words highlighted", href: "/guides/make-a-karaoke-video-with-words-highlighted" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does Syllary export ASS?", a: "No — we export LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON. For karaoke styling, our player and scene-based videos handle it." },
    ],
  },

  // 156 — what is a printable lyric sheet
  {
    slug: "guides/what-is-a-printable-lyric-sheet",
    category: "guides",
    renderType: "content",
    title: "What is a printable lyric sheet?",
    metaTitle: "What is a printable lyric sheet?",
    metaDescription:
      "A printable lyric sheet is the plain, timestamp-free words — for liner notes, rehearsal, or a publishing contact. Here's what it is and how to make one.",
    blocks: [
      {
        kind: "definition",
        term: "A printable lyric sheet",
        text: "is just the song's words laid out cleanly with no timestamps — meant to be read on paper, not by a player.",
      },
      {
        kind: "paragraph",
        text: "It's the human-readable end of the spectrum: liner notes and album inserts, a sheet to rehearse from or hand a session singer, or an attachment for a publishing or sync contact. Today this is a clean TXT export; a formatted PDF is a possible future addition.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a printable lyric sheet from a song", href: "/guides/printable-lyric-sheet" },
          { label: "Make a TXT lyrics file from audio", href: "/guides/how-to-make-a-txt-lyrics-file" },
          { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is it the same as an LRC?", a: "No — an LRC is timed for players; a lyric sheet is plain words for reading and printing." },
    ],
  },

  // 157 — synced lyrics not showing (troubleshooting)
  {
    slug: "guides/synced-lyrics-not-showing",
    category: "guides",
    renderType: "content",
    title: "Why are my synced lyrics not showing?",
    metaTitle: "Synced lyrics not showing? How to fix it",
    metaDescription:
      "Synced lyrics not displaying? Usual causes: encoding, a timing offset, malformed timestamps, or the wrong format for your player. How to fix each.",
    blocks: [
      {
        kind: "paragraph",
        text: "When synced lyrics don't show, it's almost always one of a few things. Work through these in order — each has a quick fix.",
      },
      {
        kind: "list",
        ordered: true,
        items: [
          "Encoding: a file saved as something other than UTF-8 can show blank or garbled text — re-save as UTF-8.",
          "Filename: an .lrc sidecar must match the audio filename exactly, in the same folder.",
          "Malformed timestamps: a bad [mm:ss.xx] tag can stop a player parsing the file — validate it.",
          "Offset: lyrics that appear but lag the song just need a timing offset.",
          "Wrong format: a player may want LRC, not an SRT — convert if needed.",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "LRC validator/checker", href: "/tools/lrc-validator" },
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Lyrics show but are out of sync — fix?", a: "Apply a timing offset to shift every line earlier or later until they match." },
      { q: "The text looks garbled — why?", a: "It's usually a non-UTF-8 encoding. Re-save the file as UTF-8 and it should display correctly." },
    ],
  },

  // 158 — CapCut (comparison)
  {
    slug: "compare/capcut-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "CapCut vs Syllary (for lyric captions)",
    metaTitle: "CapCut vs Syllary for lyric captions",
    metaDescription:
      "CapCut auto-captions video and can place lyrics as text. Syllary makes music-specific files (LRC/TTML), words inside a moving scene, and a public page.",
    blocks: [
      {
        kind: "paragraph",
        text: "CapCut is a general video editor with strong auto-captions, and it can even auto-place lyrics as text over your video, exporting an SRT on its Pro plan. That's great for socials. For a song, though, you also want music-specific files, the words inside the scene, and a page — which is where Syllary is built differently.",
      },
      {
        kind: "table",
        headers: ["", "CapCut", "Syllary"],
        rows: [
          ["Auto-captions / lyrics on video", "Yes (text over your video)", "Yes, plus words inside the scene"],
          ["Music formats (LRC, TTML)", "No", "Yes"],
          ["You supply the video", "Yes", "The lyric video is generated"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to CapCut: it auto-captions in many languages and can identify and place lyrics, with SRT export on Pro. The honest difference is the music formats (LRC/TTML), the scene-based video, and the hosted page.",
      },
      {
        kind: "paragraph",
        text: "Editing a video and want captions on it? CapCut is excellent. Preparing a song — files for streaming, a scene-based lyric video, a page? That's Syllary's job.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "VEED vs Syllary", href: "/compare/veed-vs-syllary" },
          { label: "Kapwing vs Syllary", href: "/compare/kapwing-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can CapCut export an LRC or TTML?", a: "CapCut focuses on captions (SRT on Pro). Syllary also exports LRC and TTML — the formats players and streaming platforms use." },
    ],
  },

  // 159 — best way (comparison/roundup)
  {
    slug: "compare/best-way-to-add-lyrics-to-your-songs",
    category: "compare",
    renderType: "content",
    title: "The best way to add lyrics to your own songs in 2026",
    metaTitle: "Best way to add lyrics to your own songs",
    metaDescription:
      "Manual syncing, paste-and-pray, catalog-gated services — or one upload that does it all. A practical guide to adding lyrics to your own songs.",
    blocks: [
      {
        kind: "paragraph",
        text: "There are a few ways to add lyrics to your own songs, and they're not equal. Here's the honest landscape — and why the one-upload route tends to win for independent and AI creators.",
      },
      {
        kind: "table",
        headers: ["Approach", "The catch"],
        rows: [
          ["Manual sync tools", "Slow — you tap each line and type the lyrics first"],
          ["Paste-and-pray generators", "Often one format, no editor, no outputs beyond a file"],
          ["Catalog-gated services", "Tied to platform accounts and release timing"],
          ["One upload (Syllary)", "Transcribe, sync, every format, a page and a video"],
        ],
      },
      {
        kind: "paragraph",
        text: "For your own or AI-generated songs, leading with the public page and the words-in-the-scene video — plus all the files — covers the widest set of needs from a single upload.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
          { label: "Best AI lyrics transcription tools", href: "/compare/best-ai-lyrics-transcription-tools" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What's the fastest route?", a: "Uploading the audio once and exporting every format — it skips typing lyrics and tapping timestamps." },
    ],
  },

  // 160 — lyrics page with streaming links (ai_music)
  {
    slug: "guides/lyrics-page-with-streaming-links",
    category: "guides",
    renderType: "content",
    title: "Make a lyrics page for your AI song with streaming links",
    metaTitle: "AI song lyrics page with streaming links",
    metaDescription:
      "Bundle your AI song's synced reader, lyric video, downloads and streaming links on one page. Upload once, publish, and share.",
    blocks: [
      {
        kind: "paragraph",
        text: "The most useful page for a released AI song puts everything in one place: a synced reader to follow the lyrics, the lyric video, downloadable files, and links to every platform the song is on. Upload once, and it all comes together.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your AI song", text: "Get synced lyrics and a video." },
          { title: "Add streaming links", text: "Gather links across platforms from a title or one link." },
          { title: "Publish the page", text: "One shareable link with the reader, video, downloads and links." },
        ],
      },
      {
        kind: "callout",
        text: "For your own or AI-generated songs only — not other artists' copyrighted recordings.",
      },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Turn your Suno song into a full lyrics page", href: "/guides/suno-song-to-full-lyrics-page" },
          { label: "Find streaming links for your song", href: "/guides/find-streaming-links-for-your-song" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Where do the streaming links come from?", a: "From a title and artist, or one link you paste — the matching platform links are gathered for the page." },
    ],
  },
];
