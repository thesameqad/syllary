import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 4 — Mini-tool pages (the 12 live tools). The interactive tool is the
// hero; copy is short. For client-side tools, the "runs in your browser /
// nothing uploaded" line is included. Meta within the ≤60 / ≤155 limits.

const cta = UNIVERSAL_CTA;

export const MINI_PAGES: SeedPage[] = [
  // 123 — LRC offset adjuster
  {
    slug: "tools/lrc-offset-adjuster",
    category: "tools",
    renderType: "tool",
    toolKey: "lrc-offset-adjuster",
    title: "LRC offset adjuster — shift your lyric timings",
    metaTitle: "LRC offset adjuster — shift lyric timings",
    metaDescription:
      "Free online tool to shift every timestamp in an .lrc by a fixed offset. Fix lyrics that show too early or too late. Runs in your browser.",
    blocks: [
      {
        kind: "paragraph",
        text: "If your synced lyrics appear a beat too early or too late, you don't need to re-time every line. Paste your .lrc below and nudge every timestamp by a fixed amount at once.",
      },
      { kind: "toolEmbed", toolKey: "lrc-offset-adjuster" },
      { kind: "heading", level: 2, text: "How it works" },
      {
        kind: "list",
        ordered: true,
        items: [
          "Paste your .lrc file into the box.",
          "Set an offset in milliseconds — positive makes the words appear later, negative makes them appear sooner.",
          "Apply the offset, then copy or download the adjusted file.",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "LRC validator", href: "/tools/lrc-validator" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
          { label: "Synced lyrics not showing", href: "/guides/synced-lyrics-not-showing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "What does the offset do?", a: "It adds or subtracts the same amount of time from every line's timestamp, so the whole file shifts together." },
      { q: "Will it change my lyrics?", a: "No — only the timings change. The words stay exactly as you pasted them." },
    ],
  },

  // 124 — Lyrics format converter (universal)
  {
    slug: "tools/lyrics-format-converter",
    category: "tools",
    renderType: "tool",
    toolKey: "format-converter",
    title: "Lyrics format converter",
    metaTitle: "Lyrics format converter (free, in-browser)",
    metaDescription:
      "Convert between .lrc, enhanced .lrc, .ttml, .srt, .vtt, .txt and .json in your browser. Drop a supported lyrics file in, get another out.",
    blocks: [
      {
        kind: "paragraph",
        text: "Have a lyrics file in one format and need another? Drop it in and convert — between LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON. It runs entirely in your browser, so nothing is uploaded.",
      },
      { kind: "toolEmbed", toolKey: "format-converter" },
      { kind: "heading", level: 2, text: "Common conversions" },
      {
        kind: "list",
        ordered: false,
        items: [
          "LRC ↔ SRT, VTT and TTML",
          "SRT ↔ VTT",
          "TTML → LRC or SRT",
          "Any supported format → plain TXT",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related converters",
        items: [
          { label: "LRC to SRT converter", href: "/convert/lrc-to-srt" },
          { label: "SRT to LRC converter", href: "/convert/srt-to-lrc" },
          { label: "LRC to TTML converter", href: "/convert/lrc-to-ttml" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I convert to JSON?", a: "Yes, as an output. JSON isn't an input, though — it's a developer format you generate, not one you arrive holding." },
      { q: "Does it handle .ass or .pdf?", a: "No — those aren't supported. The converter works with LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON." },
    ],
  },

  // 130 — Synced lyrics preview player
  {
    slug: "tools/synced-lyrics-preview-player",
    category: "tools",
    renderType: "tool",
    toolKey: "lyrics-preview-player",
    title: "Synced lyrics preview player",
    metaTitle: "Synced lyrics preview player",
    metaDescription:
      "Paste an .lrc and drop in your own audio to preview synced lyrics karaoke-style, word by word. Free and fully in your browser.",
    blocks: [
      {
        kind: "paragraph",
        text: "Check your synced lyrics before you ship them: paste your .lrc, add your audio, and watch the words highlight in time — exactly how listeners will see them.",
      },
      { kind: "toolEmbed", toolKey: "lyrics-preview-player" },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "Lyric timestamp viewer", href: "/tools/lyric-timestamp-viewer" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is my audio uploaded anywhere?", a: "No — playback happens entirely in your browser; the file never leaves your device." },
      {
        q: "Why does it sometimes highlight word by word, and sometimes line by line?",
        a: "It depends on what timing your file contains. A standard .lrc (and .srt, .vtt, .txt) stores a timestamp per line, so the player highlights the current line. An enhanced .lrc — with a timestamp on each word — or a .ttml with per-word timing lets the player highlight each word as it's sung.",
      },
      {
        q: "How do I get word-by-word (karaoke) highlighting?",
        a: "Use a file with word-level timestamps: an enhanced .lrc (each word tagged like <00:12.50>) or a .ttml with per-word timing. If you don't have one, Syllary can make it — it times every word automatically from your audio.",
      },
      {
        q: "What's the difference between the Dynamic and Full views?",
        a: "Dynamic is the karaoke focus view — one line at a time, with word-by-word highlighting when your file supports it. Full shows the whole lyric sheet with the current line highlighted.",
      },
    ],
  },

  // 117 — Lyric timestamp viewer
  {
    slug: "tools/lyric-timestamp-viewer",
    category: "tools",
    renderType: "tool",
    toolKey: "lyric-timestamp-viewer",
    title: "Lyric timestamp viewer",
    metaTitle: "Lyric timestamp viewer",
    metaDescription:
      "View every lyric line with its exact timestamp against the waveform. Paste an .lrc, .srt, .vtt or .ttml and click any line to jump.",
    blocks: [
      {
        kind: "paragraph",
        text: "See exactly when each line is timed to start. Paste your timed lyrics, optionally add the audio, and read the timestamps line by line — click any line to jump there.",
      },
      { kind: "toolEmbed", toolKey: "lyric-timestamp-viewer" },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "Synced lyrics preview player", href: "/tools/synced-lyrics-preview-player" },
          { label: "LRC validator", href: "/tools/lrc-validator" },
          { label: "LRC timestamp format explained", href: "/guides/lrc-timestamp-format-explained" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does it need the audio?", a: "No — you can view timestamps without audio. Adding the audio enables playback and click-to-jump." },
    ],
  },

  // 112 — LRC editor (online)
  {
    slug: "tools/lrc-editor",
    category: "tools",
    renderType: "tool",
    toolKey: "lrc-editor",
    title: "LRC editor (online)",
    metaTitle: "Online LRC editor with live preview",
    metaDescription:
      "Edit an .lrc in your browser with a live karaoke preview, play along with your own audio, and download when you're done. Free.",
    blocks: [
      {
        kind: "paragraph",
        text: "Tweak your .lrc and see the result instantly: edit the file on the left, watch the karaoke preview update on the right, play along with your audio, then download.",
      },
      { kind: "toolEmbed", toolKey: "lrc-editor" },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "LRC validator", href: "/tools/lrc-validator" },
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is anything uploaded?", a: "No — the editor and preview run in your browser; your files never leave your device." },
    ],
  },

  // 120 — Audio duration & silence detector
  {
    slug: "tools/audio-duration-silence-detector",
    category: "tools",
    renderType: "tool",
    toolKey: "duration-silence-detector",
    title: "Audio duration & lead-in silence detector",
    metaTitle: "Audio duration & lead-in silence detector",
    metaDescription:
      "Find an audio file's exact duration and how much silence comes before the first sound — handy for a lyric offset. Nothing uploaded.",
    blocks: [
      {
        kind: "paragraph",
        text: "Get an audio file's precise length and the amount of silence before the music starts. The lead-in number is handy for choosing a lyric offset.",
      },
      { kind: "toolEmbed", toolKey: "duration-silence-detector" },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "Synced lyrics not showing", href: "/guides/synced-lyrics-not-showing" },
          { label: "Lyric timestamp viewer", href: "/tools/lyric-timestamp-viewer" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How does this help with timing?", a: "The lead-in silence tells you roughly how much to offset lyrics that start after an intro." },
    ],
  },

  // 128 — Streaming link finder
  {
    slug: "tools/streaming-link-finder",
    category: "tools",
    renderType: "tool",
    toolKey: "streaming-link-finder",
    title: "Streaming link finder — find a song on every platform",
    metaTitle: "Streaming link finder by song name",
    metaDescription:
      "Find a song's links across Spotify, Apple Music, YouTube, Tidal, Deezer and more — by song name and artist, or one URL. Free, no sign-in.",
    blocks: [
      {
        kind: "paragraph",
        text: "Find where a song lives on every streaming service. Type a song name and artist, or paste a link you already have, and get the matching links across all the major platforms — instantly, free, no sign-in.",
      },
      { kind: "toolEmbed", toolKey: "streaming-link-finder" },
      { kind: "heading", level: 2, text: "Works with every major streaming platform" },
      {
        kind: "paragraph",
        text: "Paste a link from one service and get the rest, or start from just the song name. The finder looks the track up and returns its links across:",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Spotify",
          "Apple Music",
          "YouTube and YouTube Music",
          "Tidal",
          "Deezer",
          "Amazon Music",
          "SoundCloud",
          "Pandora",
        ],
      },
      {
        kind: "callout",
        text: "Availability depends on each platform's catalog — you'll get every link the track actually has.",
      },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "Song summary generator", href: "/tools/song-summary-generator" },
          { label: "Find streaming links for your song", href: "/guides/find-streaming-links-for-your-song" },
          { label: "Make a lyrics page with streaming links", href: "/guides/lyrics-page-with-streaming-links" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "How do I find a Spotify link by song name?",
        a: "Type the song name and artist and search — it returns the track's Spotify link along with its links on the other platforms. No account needed.",
      },
      {
        q: "Can I get a Tidal, Apple Music or YouTube link from a Spotify URL?",
        a: "Yes. Paste the Spotify link and the finder returns the same track on Tidal, Apple Music, YouTube, Deezer, Amazon Music, SoundCloud and Pandora where it's available.",
      },
      { q: "Is it free?", a: "Yes — the link finder is free and needs no account." },
    ],
  },

  // 126 — Song summary generator
  {
    slug: "tools/song-summary-generator",
    category: "tools",
    renderType: "tool",
    toolKey: "song-summary-generator",
    title: "Song summary generator",
    metaTitle: "Song summary generator — themes & mood",
    metaDescription:
      "Paste lyrics and get a short summary, key themes, and the mood of the song. Great for descriptions and catalog metadata.",
    blocks: [
      {
        kind: "paragraph",
        text: "Turn a set of lyrics into a tidy summary, a few theme tags, and a one-line mood — useful for page descriptions, release notes, or catalog metadata.",
      },
      { kind: "toolEmbed", toolKey: "song-summary-generator" },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Generate a song summary", href: "/guides/generate-a-song-summary" },
          { label: "Find the chorus", href: "/tools/find-the-chorus" },
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need an account?", a: "Yes — this uses a few tokens per run, so it needs a free sign-in." },
    ],
  },

  // 118 — Find the chorus
  {
    slug: "tools/find-the-chorus",
    category: "tools",
    renderType: "tool",
    toolKey: "find-the-chorus",
    title: "Find the chorus",
    metaTitle: "Find the chorus — label song sections",
    metaDescription:
      "Paste lyrics and see the song's structure — verses, chorus, bridge — with the chorus highlighted. Free sign-in.",
    blocks: [
      {
        kind: "paragraph",
        text: "Spot the structure of a song at a glance. Paste the lyrics and get labeled sections — verse, chorus, bridge — with the chorus called out.",
      },
      { kind: "toolEmbed", toolKey: "find-the-chorus" },
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Label song sections automatically", href: "/guides/label-song-sections-automatically" },
          { label: "Song summary generator", href: "/tools/song-summary-generator" },
          { label: "Edit lyric timing", href: "/guides/edit-lyric-timing" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How does it find the chorus?", a: "It labels sections from repeated lines and structure, calling out the chorus or hook." },
    ],
  },

  // 113 — LRC validator
  {
    slug: "tools/lrc-validator",
    category: "tools",
    renderType: "tool",
    toolKey: "lrc-validator",
    title: "LRC validator — check your synced lyrics file",
    metaTitle: "LRC validator — check & fix your .lrc",
    metaDescription:
      "Free online LRC validator. Paste an .lrc to flag malformed or out-of-order timestamps, lines missing tags, and encoding issues — before you ship it.",
    blocks: [
      {
        kind: "paragraph",
        text: "Make sure your .lrc is clean before a player or platform rejects it. Paste the file and get a clear list of any problems — no upload, no account.",
      },
      { kind: "toolEmbed", toolKey: "lrc-validator" },
      { kind: "heading", level: 2, text: "What it checks" },
      {
        kind: "list",
        ordered: false,
        items: [
          "Timestamps that don't match the [mm:ss.xx] format",
          "Timestamps that go backwards (out of order)",
          "Seconds values outside 00–59",
          "Lyric lines with no timestamp",
          "Likely encoding problems (a non-UTF-8 file showing garbled characters)",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "LRC offset adjuster", href: "/tools/lrc-offset-adjuster" },
          { label: "LRC editor (online)", href: "/tools/lrc-editor" },
          { label: "Synced lyrics not showing", href: "/guides/synced-lyrics-not-showing" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "What makes an LRC file invalid?",
        a: "Timestamps in the wrong format, timestamps that jump backwards, lines with no time tag, and files saved in a non-UTF-8 encoding. The validator flags each with the line number.",
      },
      {
        q: "Why do my lyrics show garbled characters?",
        a: "Usually an encoding mismatch — the file was saved as GB2312/GBK (or similar) instead of UTF-8. Re-save it as UTF-8 and the characters display correctly.",
      },
      { q: "Is it free?", a: "Yes — it runs entirely in your browser, no upload and no sign-in." },
    ],
  },

  // 119 — Lyrics word counter
  {
    slug: "tools/lyrics-word-counter",
    category: "tools",
    renderType: "tool",
    toolKey: "lyrics-word-counter",
    title: "Lyrics word counter",
    metaTitle: "Lyrics word counter",
    metaDescription:
      "Free lyrics word counter. Paste lyrics — plain or timed — to count words, unique words, lines and characters. Timing is stripped automatically.",
    blocks: [
      {
        kind: "paragraph",
        text: "Count the words in a song in seconds. Paste your lyrics and get the total words, unique words, lines, and characters — works with plain text or a timed file like an .lrc or .srt.",
      },
      { kind: "toolEmbed", toolKey: "lyrics-word-counter" },
      { kind: "heading", level: 2, text: "What it counts" },
      {
        kind: "list",
        ordered: false,
        items: [
          "Total words",
          "Unique words (each word counted once)",
          "Lines",
          "Characters (excluding spaces)",
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "Plain lyrics extractor", href: "/tools/plain-lyrics-extractor" },
          { label: "Lyrics format converter", href: "/tools/lyrics-format-converter" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does it work with an .lrc or .srt file?", a: "Yes — paste a timed file and the timestamps are stripped automatically, so only the words are counted." },
      { q: "Is it free?", a: "Yes — it runs in your browser, with no upload and no sign-in." },
    ],
  },

  // 129 — Plain lyrics extractor
  {
    slug: "tools/plain-lyrics-extractor",
    category: "tools",
    renderType: "tool",
    toolKey: "plain-lyrics-extractor",
    title: "Plain lyrics extractor — strip timing from LRC/SRT/VTT",
    metaTitle: "Plain lyrics extractor — strip timestamps",
    metaDescription:
      "Free tool to strip timing and markup from .lrc, .ttml, .srt or .vtt and get clean plain-text lyrics to copy or download. Runs in your browser.",
    blocks: [
      {
        kind: "paragraph",
        text: "Turn a timed lyrics or subtitle file into clean, plain text. Paste an .lrc, .ttml, .srt or .vtt and get just the words — no timestamps, no markup — ready to copy or download.",
      },
      { kind: "toolEmbed", toolKey: "plain-lyrics-extractor" },
      { kind: "heading", level: 2, text: "How it works" },
      {
        kind: "steps",
        items: [
          { title: "Paste your file", text: "Drop in an .lrc, .ttml, .srt or .vtt — the format is detected automatically." },
          { title: "Strip the timing", text: "Every timestamp and tag is removed, leaving the lyric lines." },
          { title: "Copy or download", text: "Grab the clean text or save it as a .txt." },
        ],
      },
      {
        kind: "relatedLinks",
        title: "Related tools",
        items: [
          { label: "Lyrics word counter", href: "/tools/lyrics-word-counter" },
          { label: "Lyrics format converter", href: "/tools/lyrics-format-converter" },
          { label: "Printable lyric sheet", href: "/guides/printable-lyric-sheet" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How do I remove timestamps from an LRC?", a: "Paste the .lrc here and the tool strips every [mm:ss.xx] tag, returning just the lyric lines as plain text." },
      { q: "Can I get plain text from subtitles (.srt or .vtt)?", a: "Yes — paste the subtitle file and it returns the lines without the timing cues or numbering." },
      { q: "Is it free?", a: "Yes — it runs entirely in your browser, no upload and no sign-in." },
    ],
  },
];
