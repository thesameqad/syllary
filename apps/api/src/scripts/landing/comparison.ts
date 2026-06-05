import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 1 — Comparison / "vs" pages (#1–30).
// Verified via web search (June 2026). Leads with our genuinely unique parts —
// a hosted public song page + a lyric video where the words live inside a moving
// scene — never false format/feature superiority. Honest-caveat callouts on the
// rows where competitors genuinely overlap.

const cta = UNIVERSAL_CTA;

export const COMPARISON_PAGES: SeedPage[] = [
  // 1 — QuickLRC ⚠️
  {
    slug: "compare/quicklrc-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "QuickLRC vs Syllary",
    metaTitle: "QuickLRC vs Syllary: files vs a full lyric project",
    metaDescription:
      "QuickLRC auto-syncs lyrics and exports many subtitle formats. Syllary adds a hosted public song page and a video where the words live inside the scene.",
    blocks: [
      {
        kind: "paragraph",
        text: "Both tools auto-transcribe a song and sync the lyrics — so this isn't a \"formats vs one format\" story. QuickLRC actually exports more subtitle formats than we do. The real difference is what happens after the files: QuickLRC hands you subtitle files to take into a separate video editor, while Syllary turns one upload into the files plus a hosted public song page and a lyric video where the words are built into a moving scene.",
      },
      {
        kind: "table",
        headers: ["", "QuickLRC", "Syllary"],
        rows: [
          ["Auto-transcribe + sync", "Yes", "Yes"],
          ["Export formats", "LRC, SRT, VTT, TTML, ASS, TXT", "LRC, enhanced LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Hosted public song page", "No", "Yes (opt-in, your own/AI songs)"],
          ["Lyric video", "Export a subtitle file into your own editor", "Generated for you — words inside a moving scene"],
          ["One project", "Files only", "Files + page + video from one upload"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to QuickLRC: it auto-transcribes, has a tap-to-sync editor and converters, and exports ASS and TTML — formats we don't. If all you need is subtitle files, it's a strong, focused tool. Syllary's edge isn't more formats; it's the page and the scene-based video you get from the same upload.",
      },
      {
        kind: "paragraph",
        text: "Pick QuickLRC if you only want subtitle files and you'll build any video yourself. Pick Syllary if you want the files and a shareable lyrics page and a lyric video — without opening a video editor.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "QuickLRC alternative", href: "/compare/quicklrc-alternative" },
          { label: "AI LRC Generator vs Syllary", href: "/compare/ai-lrc-generator-vs-syllary" },
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Does QuickLRC make a lyric video?",
        a: "It exports subtitle files (like SRT or VTT) that you import into a video editor; it doesn't generate a finished scene-based video. Syllary generates the video for you, with the words inside a moving scene.",
      },
      {
        q: "Which exports more formats?",
        a: "QuickLRC exports a few we don't (such as ASS). Syllary covers the distribution set — LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON — plus the page and video.",
      },
    ],
  },

  // 2 — AI LRC Generator ⚠️ (corrected: it's multi-format, not single-format)
  {
    slug: "compare/ai-lrc-generator-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "AI LRC Generator vs Syllary",
    metaTitle: "AI LRC Generator vs Syllary compared",
    metaDescription:
      "AI LRC Generator makes synced lyric files fast. Syllary turns one upload into the files plus a public lyrics page and a words-in-the-scene video.",
    blocks: [
      {
        kind: "paragraph",
        text: "AI LRC Generator is a capable file maker — vocal detection, a real-time editor, batch processing and exports in LRC, SRT, ASS and TXT. If your goal ends at the file, it does the job. Syllary aims past the file: the same upload also becomes a hosted public song page and a lyric video where the words are part of a moving scene, and it exports the streaming set including TTML for Apple Music.",
      },
      {
        kind: "table",
        headers: ["", "AI LRC Generator", "Syllary"],
        rows: [
          ["Auto-sync from audio", "Yes", "Yes"],
          ["Batch files", "Yes", "Yes (organize by album/artist)"],
          ["TTML for Apple Music", "Not listed", "Yes"],
          ["Public lyrics page", "No", "Yes"],
          ["Words-in-scene lyric video", "No", "Yes"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to AI LRC Generator: it's multi-format and supports many languages, so this isn't \"one format vs many.\" The honest difference is the page and the scene-based video, plus TTML for Apple, which round out a release rather than just producing a file.",
      },
      {
        kind: "paragraph",
        text: "If you just need a quick LRC or SRT, either works. If you want everything a release needs from one upload — every format, a page, a video — Syllary is built for that.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
          { label: "LRC Creator vs Syllary", href: "/compare/lrc-creator-vs-syllary" },
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do both support multiple languages?",
        a: "Yes. Both transcribe and sync lyrics in many languages. The difference is what you get around the file — Syllary adds a public page and a scene-based video.",
      },
      {
        q: "Can I get a TTML file for Apple Music?",
        a: "Syllary exports TTML, the format distributors deliver to Apple Music. Confirm your specific format needs with your distributor.",
      },
    ],
  },

  // 3 — Karadeo ⚠️ (corrected: general AI karaoke maker, not commercial library)
  {
    slug: "compare/karadeo-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Karadeo vs Syllary",
    metaTitle: "Karadeo vs Syllary: karaoke video compared",
    metaDescription:
      "Karadeo makes karaoke videos with text over a background. Syllary builds the words into a moving scene and adds a public page and every lyric file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Karadeo makes karaoke videos from your song: it separates the vocals, times the words, and lets you style text over a background. That's a Type-1 lyric video — the words sit on top of the picture. Syllary takes a different visual approach: the words are built into a generated scene that moves, and the same upload also gives you a hosted public page and every distribution-ready lyric file.",
      },
      {
        kind: "table",
        headers: ["", "Karadeo", "Syllary"],
        rows: [
          ["Word-by-word timing", "Yes", "Yes"],
          ["Video style", "Text over a background (overlay)", "Words inside a moving scene"],
          ["Lyric files to download", "Some (LRC/VTT/ASS import)", "Full set: LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Public lyrics page", "No", "Yes (own/AI songs)"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to Karadeo: it auto-syncs, exports in 1080p, runs in the browser, and accepts LRC/VTT/ASS — a genuinely good karaoke-video maker. The honest distinction is the visual style (words in a moving scene vs text on a background) plus the page and the full file set.",
      },
      {
        kind: "paragraph",
        text: "Want a classic karaoke overlay to post? Karadeo is purpose-built for that. Want the words to live inside the scene, plus a page and all the files for distribution? That's Syllary. Both are for your own or AI-generated songs.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Specterr vs Syllary", href: "/compare/specterr-vs-syllary" },
          { label: "EchoWave vs Syllary", href: "/compare/echowave-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "What's a Type-1 lyric video?",
        a: "It's text highlighted over a background or footage — the words and the picture are separate layers. Syllary's videos instead build the words into a moving scene.",
      },
      {
        q: "Are these for any song?",
        a: "Use them for your own or AI-generated songs. Don't make karaoke or public pages from someone else's copyrighted recording.",
      },
    ],
  },

  // 4 — LRC Creator
  {
    slug: "compare/lrc-creator-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "LRC Creator vs Syllary",
    metaTitle: "LRC Creator vs Syllary: manual vs automatic",
    metaDescription:
      "Classic LRC Creator tools tap-to-sync lyrics by hand. Syllary auto-transcribes and times your song, then exports every format plus a page and a video.",
    blocks: [
      {
        kind: "paragraph",
        text: "The classic \"LRC Creator\" workflow is hands-on: you paste the lyrics, play the track, and tap a key on each line to set its timestamp. It works, but it's slow and you need the lyrics typed out first. Syllary removes both steps — it transcribes the words from the audio and times them automatically, so you start from a finished draft and only fix what's off.",
      },
      {
        kind: "table",
        headers: ["", "LRC Creator (manual)", "Syllary"],
        rows: [
          ["Need lyrics typed first", "Yes", "No — transcribed for you"],
          ["Timing method", "Tap each line by hand", "Automatic, then quick corrections"],
          ["Output", "LRC", "LRC + every other format"],
          ["Page + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "If you enjoy hand-syncing a single track, a manual LRC creator is fine. If you'd rather not type lyrics or tap timestamps — especially across several songs — Syllary's automatic pass saves the tedious part and still lets you correct anything.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
          { label: "LyricSync vs Syllary", href: "/compare/lyricsync-vs-syllary" },
          { label: "Desktop LRC tools vs Syllary", href: "/compare/desktop-lrc-tools-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do I still need to type the lyrics?",
        a: "No. Syllary transcribes them from the audio. You only tweak any word or timestamp that's slightly off.",
      },
      {
        q: "Can I fine-tune the timing by hand?",
        a: "Yes — there's an editor to nudge line and word timings after the automatic pass.",
      },
    ],
  },

  // 5 — LyricSync
  {
    slug: "compare/lyricsync-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "LyricSync vs Syllary",
    metaTitle: "LyricSync vs Syllary compared",
    metaDescription:
      "Sync-focused tools stop at the timed file. Syllary transcribes, times, and exports every format from one pass — then adds a public page and a lyric video.",
    blocks: [
      {
        kind: "paragraph",
        text: "Sync-first tools assume you already have the lyrics and just need to line them up with the audio. Syllary covers the whole path in one pass: it transcribes the words, times each line and word, exports every common format, and can publish a page or build a video — so you're not stitching separate tools together.",
      },
      {
        kind: "table",
        headers: ["", "Sync-only tools", "Syllary"],
        rows: [
          ["Transcription included", "Usually no", "Yes"],
          ["Line + word timing", "Line, sometimes word", "Both"],
          ["Formats from one pass", "Often one", "All seven"],
          ["Page + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Already have clean lyrics and only need timing? A sync tool is enough. Starting from just the audio, or want more than a file at the end? Syllary takes you from upload to every output.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "LRC Creator vs Syllary", href: "/compare/lrc-creator-vs-syllary" },
          { label: "AI LRC Generator vs Syllary", href: "/compare/ai-lrc-generator-vs-syllary" },
          { label: "Best AI lyrics transcription tools", href: "/compare/best-ai-lyrics-transcription-tools" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "What if my lyrics are already written?",
        a: "You can still use Syllary — it will time your existing lines to the audio and export every format, plus the page and video options.",
      },
    ],
  },

  // 6 — Musixmatch (for artists)
  {
    slug: "compare/musixmatch-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Musixmatch vs Syllary (for artists)",
    metaTitle: "Musixmatch vs Syllary for artists",
    metaDescription:
      "Musixmatch routes lyrics to platforms after release. Syllary makes the timed files you own — every format — plus your own public page and a lyric video.",
    blocks: [
      {
        kind: "paragraph",
        text: "These solve different parts of the same problem. Musixmatch is how synced lyrics reach Spotify: you link a Musixmatch account to your artist profile, and after your track is live you add and time the lyrics there. Syllary is where you prepare accurate, perfectly-timed lyrics in the first place — and it gives you the actual files (every format), a public page you control, and a lyric video, none of which Musixmatch produces.",
      },
      {
        kind: "table",
        headers: ["", "Musixmatch", "Syllary"],
        rows: [
          ["Main role", "Route lyrics to streaming platforms", "Create timed lyrics + outputs you own"],
          ["Downloadable files", "Not the focus", "LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Your own public page", "No", "Yes"],
          ["Lyric video", "No", "Yes (words in a scene)"],
          ["When you use it", "After the track is live", "Anytime, from the audio"],
        ],
      },
      {
        kind: "paragraph",
        text: "They're complementary: prepare clean, well-timed lyrics and your file set in Syllary, then use Musixmatch to push synced lyrics onto Spotify after release. Verify the current steps with Spotify and your distributor, as platform processes change.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Musixmatch alternative", href: "/compare/musixmatch-alternative" },
          { label: "Genius vs Syllary", href: "/compare/genius-vs-syllary" },
          { label: "LyricFind vs Syllary", href: "/compare/lyricfind-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Does Syllary put lyrics on Spotify directly?",
        a: "No — Spotify shows synced lyrics through Musixmatch. Syllary prepares the accurate, timed lyrics and all the files; you submit synced lyrics through Musixmatch after release.",
      },
      {
        q: "Do I need a paid account to add lyrics to Spotify?",
        a: "You add and sync lyrics through a linked Musixmatch account after your song is live; check Spotify's current requirements, which can change.",
      },
    ],
  },

  // 7 — Desktop LRC tools (MiniLyrics etc.)
  {
    slug: "compare/desktop-lrc-tools-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Desktop LRC tools vs Syllary",
    metaTitle: "Desktop LRC tools vs Syllary",
    metaDescription:
      "Desktop plugins like MiniLyrics fetch and display lyrics with manual edits. Syllary runs in the browser, transcribes from audio, and exports every format.",
    blocks: [
      {
        kind: "paragraph",
        text: "Desktop tools like MiniLyrics live inside your media player: they fetch lyrics from a database, show them scrolling, and let you hand-edit an LRC. They're built for displaying lyrics on your own computer, not for producing release-ready files from scratch. Syllary runs in any browser, transcribes the words straight from your audio, and exports the full format set — plus a page and a video.",
      },
      {
        kind: "table",
        headers: ["", "Desktop plugins", "Syllary"],
        rows: [
          ["Install required", "Yes", "No — browser based"],
          ["Source of lyrics", "Online database / manual", "Transcribed from your audio"],
          ["Formats", "LRC, TXT", "LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Page + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "If you mainly want lyrics to appear in your desktop player, a plugin is handy. If you're preparing a release — your own or AI-generated — and need real files plus a page and video, Syllary is the faster, no-install route.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "LRC Creator vs Syllary", href: "/compare/lrc-creator-vs-syllary" },
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can Syllary make an LRC sidecar for my player?",
        a: "Yes — export an LRC and drop it next to your audio file with the same name, and most players will show synced lyrics.",
      },
    ],
  },

  // 8 — Rotor
  {
    slug: "compare/rotor-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Rotor vs Syllary",
    metaTitle: "Rotor vs Syllary: stock video vs words-in-scene",
    metaDescription:
      "Rotor cuts stock footage to your beat with text overlays. Syllary builds the lyrics into a moving scene and exports every synced-lyrics file too.",
    blocks: [
      {
        kind: "paragraph",
        text: "Rotor makes a music video by matching clips from a huge stock-footage library to your track's rhythm, and you can add text overlays like the song title. It's footage-first: the visuals are stock clips, and any lyrics you add sit on top. Syllary is lyrics-first — it auto-syncs the words from your audio and builds them into a generated scene that moves, and it also hands you every synced-lyrics file and a public page.",
      },
      {
        kind: "table",
        headers: ["", "Rotor", "Syllary"],
        rows: [
          ["Visual source", "Stock-footage library", "Generated scene built around the words"],
          ["Lyrics", "Optional text overlay you add", "Auto-synced, inside the scene"],
          ["Synced-lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Choose Rotor for a quick stock-footage cut for socials or a streaming canvas. Choose Syllary when the song's words are the point — and when you also need the lyrics files and a page from the same upload.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Neural Frames vs Syllary", href: "/compare/neural-frames-vs-syllary" },
          { label: "Specterr vs Syllary", href: "/compare/specterr-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Does Syllary use stock footage?",
        a: "No — instead of cutting stock clips, it generates a scene and builds the lyrics into it, synced to the audio.",
      },
    ],
  },

  // 9 — Neural Frames ⚠️ (has a lyric-showcase panel)
  {
    slug: "compare/neural-frames-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Neural Frames vs Syllary",
    metaTitle: "Neural Frames vs Syllary compared",
    metaDescription:
      "Neural Frames makes audio-reactive AI visuals with a lyric panel. Syllary auto-transcribes and builds the words into the scene, plus every lyrics file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Neural Frames generates audio-reactive AI visuals and can showcase lyrics through a timestamped panel. It's a powerful generative-video tool aimed at visuals first, with lyrics as one layer you set up. Syllary is built the other way around: it transcribes the words from the audio, times them automatically, and makes them the subject of a moving scene — then also exports the lyrics files and a page.",
      },
      {
        kind: "table",
        headers: ["", "Neural Frames", "Syllary"],
        rows: [
          ["Transcribe from audio", "You supply lyric timing", "Automatic"],
          ["Visual focus", "Audio-reactive AI visuals", "The words, inside a moving scene"],
          ["Synced-lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to Neural Frames: it has real lyric features and deep visual control, so it's not \"no lyrics vs lyrics.\" The honest difference is auto-transcription and sync straight from the audio, the words built into the scene, and the downloadable file set for distribution.",
      },
      {
        kind: "paragraph",
        text: "Want maximum control over abstract, reactive visuals? Neural Frames is built for that. Want the actual words visualized and synced automatically, plus the files you need to ship? That's Syllary.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Kaiber vs Syllary", href: "/compare/kaiber-vs-syllary" },
          { label: "Rotor vs Syllary", href: "/compare/rotor-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Is Syllary a full music-video maker?",
        a: "No — it makes a lyric visualization, not a narrative music video with performers or a plot. The focus is the words, visualized.",
      },
    ],
  },

  // 10 — Kaiber
  {
    slug: "compare/kaiber-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Kaiber vs Syllary",
    metaTitle: "Kaiber vs Syllary: AI visuals vs lyric video",
    metaDescription:
      "Kaiber turns prompts and images into beat-synced AI animation. Syllary visualizes your actual lyrics inside a moving scene and exports every synced file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Kaiber turns text prompts, photos, and music into animated, beat-reactive visuals. It's a generative-art tool — the visuals follow the rhythm and mood, not the words. Syllary is about the words themselves: it transcribes them from your audio, times them, and builds them into a moving scene, then also gives you the lyrics files and a public page.",
      },
      {
        kind: "table",
        headers: ["", "Kaiber", "Syllary"],
        rows: [
          ["Reacts to", "Beat, mood, prompts", "The actual lyrics"],
          ["Lyrics on screen", "Not the focus", "Yes — inside the scene, synced"],
          ["Lyrics files", "No", "Yes — full set"],
          ["What it is", "Generative art video", "Lyric visualization"],
        ],
      },
      {
        kind: "paragraph",
        text: "Set expectations clearly: Syllary makes a visualization of what's being sung, not a story film. If you want abstract, beat-driven art, Kaiber is great. If you want the words on screen and the files to ship, choose Syllary.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Neural Frames vs Syllary", href: "/compare/neural-frames-vs-syllary" },
          { label: "Freebeat vs Syllary", href: "/compare/freebeat-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Does Kaiber sync the lyrics?",
        a: "Kaiber reacts to the beat and mood rather than syncing the words. Syllary transcribes and times the lyrics so they appear exactly when they're sung.",
      },
    ],
  },

  // 11 — Specterr
  {
    slug: "compare/specterr-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Specterr vs Syllary",
    metaTitle: "Specterr vs Syllary: visualizer vs lyric scene",
    metaDescription:
      "Specterr makes audio visualizers and overlay lyric videos you time by hand. Syllary auto-syncs words into a moving scene and exports every lyrics file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Specterr is an audio-visualizer and lyric-video maker: you paste the lyrics, drag them to the right timestamps, and it animates them over a visualizer background. The words are an overlay you place yourself. Syllary auto-transcribes and times the words for you and builds them into a moving scene, and the same upload also produces every synced-lyrics file and a public page.",
      },
      {
        kind: "table",
        headers: ["", "Specterr", "Syllary"],
        rows: [
          ["Lyric timing", "Drag lines to timestamps by hand", "Automatic, then quick fixes"],
          ["Video style", "Text over a visualizer (overlay)", "Words inside a moving scene"],
          ["Synced-lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to Specterr: its visualizers and styling are excellent and it renders fast in the cloud. The honest difference is automatic sync (vs placing lyrics by hand), the words living in the scene, and the downloadable files for distribution.",
      },
      {
        kind: "paragraph",
        text: "Want a slick visualizer with hand-placed lyrics? Specterr is purpose-built. Want the words synced automatically and built into the scene, plus the files to ship? Syllary.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Specterr alternative", href: "/compare/specterr-alternative" },
          { label: "EchoWave vs Syllary", href: "/compare/echowave-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do I have to place each lyric line myself?",
        a: "In Specterr you drag lines to their timestamps. Syllary times them automatically from the audio, and you only correct anything that's off.",
      },
    ],
  },

  // 12 — Steve.AI
  {
    slug: "compare/steve-ai-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Steve.AI vs Syllary",
    metaTitle: "Steve.AI vs Syllary compared",
    metaDescription:
      "Steve.AI is a general prompt-to-video maker. Syllary is purpose-built for songs: auto transcription, auto-synced words in a scene, and every lyric file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Steve.AI is a general video generator — it turns text, prompts, or audio into all kinds of videos, with AI voices and animation. It isn't built around a song's lyrics. Syllary does one thing deeply: it takes a song, transcribes and times the words, builds them into a moving scene, and exports every lyrics format plus a public page.",
      },
      {
        kind: "table",
        headers: ["", "Steve.AI", "Syllary"],
        rows: [
          ["Built for", "General videos and animation", "Songs and their lyrics"],
          ["Lyric transcription + sync", "No", "Yes"],
          ["Lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "For explainers, ads, or general animation, a broad tool like Steve.AI fits. For a song — the words synced and visualized, plus the files a release needs — Syllary is the focused choice.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Animaker vs Syllary", href: "/compare/animaker-vs-syllary" },
          { label: "FlexClip vs Syllary", href: "/compare/flexclip-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can a general video tool make a lyric video?",
        a: "You can place text by hand, but it won't transcribe or sync your lyrics. Syllary does that automatically and builds the words into the scene.",
      },
    ],
  },

  // 13 — VEED
  {
    slug: "compare/veed-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "VEED vs Syllary",
    metaTitle: "VEED vs Syllary: captions vs music lyrics",
    metaDescription:
      "VEED auto-captions video as SRT/VTT. Syllary is music-specific: auto-synced words in a scene, plus LRC and TTML files VEED doesn't produce.",
    blocks: [
      {
        kind: "paragraph",
        text: "VEED is a general video editor with excellent auto-captions — it transcribes speech and burns styled subtitles onto your video, exporting SRT or VTT. That's perfect for talking-head content. For a song, you need more: music formats like LRC and TTML, word-level karaoke timing, and a visual where the words belong to the scene. Syllary is built for exactly that.",
      },
      {
        kind: "table",
        headers: ["", "VEED", "Syllary"],
        rows: [
          ["Auto-captions", "Yes (SRT/VTT)", "Yes, plus music formats"],
          ["Music formats (LRC, TTML)", "No", "Yes"],
          ["Word-level karaoke timing", "Caption-style", "Yes — enhanced LRC"],
          ["Words-in-scene video", "Text over your video", "Words inside a generated scene"],
        ],
      },
      {
        kind: "paragraph",
        text: "Captioning a vlog or interview? VEED is great. Preparing a song for streaming and a lyric video? Syllary produces the music-specific files and the scene-based visual that a general captioner doesn't.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Kapwing vs Syllary", href: "/compare/kapwing-vs-syllary" },
          { label: "FlexClip vs Syllary", href: "/compare/flexclip-vs-syllary" },
          { label: "Best AI lyrics transcription tools", href: "/compare/best-ai-lyrics-transcription-tools" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can VEED export an LRC or TTML?",
        a: "VEED focuses on subtitle formats like SRT and VTT. Syllary also exports LRC, enhanced LRC and TTML — the formats music players and streaming platforms use.",
      },
    ],
  },

  // 14 — Kapwing
  {
    slug: "compare/kapwing-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Kapwing vs Syllary",
    metaTitle: "Kapwing vs Syllary compared",
    metaDescription:
      "Kapwing auto-captions and styles video for social. Syllary is music-first: auto-synced lyrics in a scene, plus LRC and TTML files and a public song page.",
    blocks: [
      {
        kind: "paragraph",
        text: "Kapwing is a browser video editor with strong auto-captions, made for social clips — it transcribes speech and exports SRT, VTT or TXT. It treats lyrics like captions: text laid over your video. Syllary treats them like music: it times each word, can highlight word-by-word, builds the words into a moving scene, and exports the streaming formats plus a hosted page.",
      },
      {
        kind: "table",
        headers: ["", "Kapwing", "Syllary"],
        rows: [
          ["Made for", "Social video captions", "Songs and lyrics"],
          ["Exports", "SRT, VTT, TXT", "LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Words-in-scene video", "Text over video", "Words inside the scene"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "For captioned social videos, Kapwing is a fast all-rounder. For a song that needs music formats, karaoke timing, a scene-based video and a page, Syllary is purpose-built.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "VEED vs Syllary", href: "/compare/veed-vs-syllary" },
          { label: "FlexClip vs Syllary", href: "/compare/flexclip-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Is a caption file the same as an LRC?",
        a: "Not quite — SRT/VTT are subtitle formats; LRC and enhanced LRC are made for music players and karaoke. Syllary exports both kinds from one upload.",
      },
    ],
  },

  // 15 — FlexClip
  {
    slug: "compare/flexclip-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "FlexClip vs Syllary",
    metaTitle: "FlexClip vs Syllary compared",
    metaDescription:
      "FlexClip is a template-based video maker where you add text. Syllary auto-syncs lyrics into a moving scene and exports every synced-lyrics file too.",
    blocks: [
      {
        kind: "paragraph",
        text: "FlexClip is a template-driven video and animation maker — you pick a template, drop in media, and add text and effects by hand. There's no lyric transcription or sync; any words you show are manual. Syllary starts from your audio, transcribes and times the lyrics automatically, builds them into a moving scene, and exports the full set of lyrics files plus a page.",
      },
      {
        kind: "table",
        headers: ["", "FlexClip", "Syllary"],
        rows: [
          ["Approach", "Templates you fill in", "One upload, automatic outputs"],
          ["Lyric sync", "Manual text", "Automatic from audio"],
          ["Lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "FlexClip is handy for quick templated videos. For a song, Syllary removes the manual text work and adds the files and page a release needs.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Steve.AI vs Syllary", href: "/compare/steve-ai-vs-syllary" },
          { label: "Animaker vs Syllary", href: "/compare/animaker-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Does FlexClip time lyrics to the music?",
        a: "No — you add and position text yourself. Syllary times the words automatically so they appear when they're sung.",
      },
    ],
  },

  // 16 — Freebeat
  {
    slug: "compare/freebeat-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Freebeat vs Syllary",
    metaTitle: "Freebeat vs Syllary: beat video vs lyric video",
    metaDescription:
      "Freebeat makes beat-synced AI music videos with avatars. Syllary visualizes the actual lyrics in a moving scene and exports every synced-lyrics file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Freebeat generates cinematic AI music videos that react to the beat — avatars, motion, and visuals tuned to the rhythm and song structure. It's about the groove and the look, not the words. Syllary is lyrics-first: it transcribes and times the words and builds them into a moving scene, and it also exports every lyrics file and a public page.",
      },
      {
        kind: "table",
        headers: ["", "Freebeat", "Syllary"],
        rows: [
          ["Reacts to", "Beat and song structure", "The actual lyrics"],
          ["On-screen words", "Not the focus", "Yes — synced, in the scene"],
          ["Lyrics files", "No", "Yes — full set"],
          ["What it is", "Beat-synced AI video", "Lyric visualization"],
        ],
      },
      {
        kind: "paragraph",
        text: "Different jobs: Freebeat for a beat-driven, avatar-style video; Syllary when the lyrics are the star and you also need the files and a page.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Kaiber vs Syllary", href: "/compare/kaiber-vs-syllary" },
          { label: "Rotor vs Syllary", href: "/compare/rotor-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Will Freebeat show my lyrics?",
        a: "Freebeat focuses on beat-synced visuals rather than the words. Syllary puts the actual lyrics on screen, synced to the audio.",
      },
    ],
  },

  // 17 — TopMediai
  {
    slug: "compare/topmediai-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "TopMediai vs Syllary",
    metaTitle: "TopMediai vs Syllary compared",
    metaDescription:
      "TopMediai is a broad AI suite you hop between. Syllary is one focused project: audio to synced lyrics, every file, a scene-based video, and a public page.",
    blocks: [
      {
        kind: "paragraph",
        text: "TopMediai is a wide AI toolbox — video generation, music tools, text-to-speech and more, each a separate utility. For lyrics work you'd stitch several together. Syllary is a single focused flow: upload a song, get the transcribed and timed lyrics, every export format, a scene-based video, and a public page — without bouncing between tools.",
      },
      {
        kind: "table",
        headers: ["", "TopMediai", "Syllary"],
        rows: [
          ["Shape", "Many separate AI tools", "One project, end to end"],
          ["Lyric transcription + sync", "Not the focus", "Core feature"],
          ["Lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "If you want a grab-bag of AI utilities, a suite fits. If your job is a song's lyrics — files, a video, a page — Syllary does it in one place. (For visuals, Syllary stays focused on your own and AI-generated songs.)",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Steve.AI vs Syllary", href: "/compare/steve-ai-vs-syllary" },
          { label: "EchoWave vs Syllary", href: "/compare/echowave-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Why use a focused tool over a suite?",
        a: "For one job — turning a song into synced lyrics, files, a video and a page — a focused flow means fewer steps and no hand-offs between tools.",
      },
    ],
  },

  // 18 — EchoWave ⚠️ (can auto-add lyrics)
  {
    slug: "compare/echowave-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "EchoWave vs Syllary",
    metaTitle: "EchoWave vs Syllary compared",
    metaDescription:
      "EchoWave makes template lyric videos with text over a background. Syllary builds the words into a moving scene and exports every synced-lyrics file too.",
    blocks: [
      {
        kind: "paragraph",
        text: "EchoWave makes lyric videos in the browser — it can auto-add lyrics or let you type them, then styles the text over a template background with waveforms and animations. That's a Type-1 video: the words sit on the picture. Syllary builds the words into a generated scene that moves, and the same upload also produces every synced-lyrics file and a public page.",
      },
      {
        kind: "table",
        headers: ["", "EchoWave", "Syllary"],
        rows: [
          ["Lyric video", "Text over a template background", "Words inside a moving scene"],
          ["Auto lyrics", "Yes", "Yes"],
          ["Synced-lyrics files", "Limited", "Full set: LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "callout",
        text: "Fair to EchoWave: it's a quick, template-friendly lyric-video maker that can auto-add lyrics — not a manual-only tool. The honest difference is the visual style (words in a moving scene vs over a background) and the full file set plus a page.",
      },
      {
        kind: "paragraph",
        text: "Want a fast templated lyric video for socials? EchoWave fits. Want the words inside the scene plus distribution files and a page? Syllary.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Specterr vs Syllary", href: "/compare/specterr-vs-syllary" },
          { label: "Karadeo vs Syllary", href: "/compare/karadeo-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do both auto-add lyrics?",
        a: "Yes. The difference is what the video looks like — text over a background vs the words built into a moving scene — and the files you get alongside it.",
      },
    ],
  },

  // 19 — Animaker
  {
    slug: "compare/animaker-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Animaker vs Syllary",
    metaTitle: "Animaker vs Syllary compared",
    metaDescription:
      "Animaker is a DIY animation maker with full design control. Syllary is lyrics-first: auto transcription, words synced into a scene, and every lyric file.",
    blocks: [
      {
        kind: "paragraph",
        text: "Animaker is a DIY animation studio — characters, scenes, and total design control, built for general animated videos. There's no lyric transcription or sync; words are something you place and animate yourself. Syllary is lyrics-first: it transcribes and times the words from your audio, builds them into a moving scene, and exports every lyrics format plus a page.",
      },
      {
        kind: "table",
        headers: ["", "Animaker", "Syllary"],
        rows: [
          ["Built for", "DIY animation", "Songs and lyrics"],
          ["Lyric sync", "Manual", "Automatic"],
          ["Lyrics files", "No", "Yes — full set"],
          ["Public lyrics page", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Love hand-crafting animation? Animaker gives you the controls. Want a song's words synced and visualized with the files to ship? Syllary does that automatically.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Steve.AI vs Syllary", href: "/compare/steve-ai-vs-syllary" },
          { label: "FlexClip vs Syllary", href: "/compare/flexclip-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can Animaker sync to my song?",
        a: "It animates what you build by hand; it doesn't transcribe or time lyrics. Syllary does both automatically from the audio.",
      },
    ],
  },

  // 20 — Genius
  {
    slug: "compare/genius-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Genius vs Syllary",
    metaTitle: "Genius vs Syllary: read vs create",
    metaDescription:
      "Genius hosts community lyrics for commercial catalogs. Syllary makes timed lyric files from your own song and gives you your own public page and a video.",
    blocks: [
      {
        kind: "paragraph",
        text: "Genius is a lyrics community — a huge, mostly crowd-sourced library of song lyrics to read and annotate, tied to commercial catalogs and publisher licensing. It's for looking up other people's songs. Syllary is the opposite end: you bring your own (or AI-generated) song, and it creates the timed lyric files, your own public page, and a lyric video — all things you own.",
      },
      {
        kind: "table",
        headers: ["", "Genius", "Syllary"],
        rows: [
          ["Whose songs", "Commercial catalog (read others')", "Your own / AI-generated"],
          ["Lyrics", "Plain text to read", "Timed, synced, downloadable"],
          ["Your own page", "No", "Yes (opt-in)"],
          ["Files + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Looking up a hit's lyrics? That's Genius. Publishing and shipping your own song with timed lyrics, files, a page and a video? That's Syllary — and it keeps you on the right side of copyright by being for your own work.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Genius alternative (for your own songs)", href: "/compare/genius-alternative" },
          { label: "AZLyrics vs Syllary", href: "/compare/azlyrics-vs-syllary" },
          { label: "Lyrics.com vs Syllary", href: "/compare/lyrics-com-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can I host my own song's lyrics page?",
        a: "Yes — Syllary publishes an opt-in public page for your own or AI-generated songs, with a synced reader, downloads and links.",
      },
      {
        q: "Can I make a page for a famous song?",
        a: "No. Public pages are for your own or AI-generated songs only — not someone else's copyrighted recording.",
      },
    ],
  },

  // 21 — AZLyrics
  {
    slug: "compare/azlyrics-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "AZLyrics vs Syllary",
    metaTitle: "AZLyrics vs Syllary compared",
    metaDescription:
      "AZLyrics is a static directory of song lyrics to read. Syllary turns your own audio into timed, downloadable lyric files and a karaoke-style public page.",
    blocks: [
      {
        kind: "paragraph",
        text: "AZLyrics is a static directory — a vast alphabetical archive of song lyrics you read on a page. There's nothing timed, nothing to download, and nothing tied to your own audio. Syllary is a creation tool: upload your song and it produces timed, synced lyric files you can download and a karaoke-style page where listeners follow along.",
      },
      {
        kind: "table",
        headers: ["", "AZLyrics", "Syllary"],
        rows: [
          ["Purpose", "Read existing lyrics", "Create timed files from your audio"],
          ["Timing", "None (plain text)", "Line and word-level"],
          ["Downloads", "No", "LRC, TTML, SRT, VTT, TXT, JSON"],
          ["Your own page", "No", "Yes (own/AI songs)"],
        ],
      },
      {
        kind: "paragraph",
        text: "AZLyrics answers \"what are the words to this song?\" Syllary answers \"how do I turn my song into synced files and a page?\" — for your own or AI-generated music.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Genius vs Syllary", href: "/compare/genius-vs-syllary" },
          { label: "Lyrics.com vs Syllary", href: "/compare/lyrics-com-vs-syllary" },
          { label: "LyricFind vs Syllary", href: "/compare/lyricfind-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can I download a synced file from a lyrics directory?",
        a: "Directories show plain text only. Syllary creates downloadable, timed files (like LRC) from your own audio.",
      },
    ],
  },

  // 22 — Lyrics.com
  {
    slug: "compare/lyrics-com-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "Lyrics.com vs Syllary",
    metaTitle: "Lyrics.com vs Syllary compared",
    metaDescription:
      "Lyrics.com is for looking up lyrics. Syllary creates timed, downloadable lyric files from your own song and a synced public page you control.",
    blocks: [
      {
        kind: "paragraph",
        text: "Lyrics.com is a lookup site — search a song and read the words. It's a reference, not a workshop. Syllary is for producing something: from your own audio it transcribes the words, times them, exports every format, and can publish a synced page and a lyric video.",
      },
      {
        kind: "table",
        headers: ["", "Lyrics.com", "Syllary"],
        rows: [
          ["Role", "Look up lyrics", "Create synced files + outputs"],
          ["From your audio", "No", "Yes"],
          ["Downloadable formats", "No", "Full set"],
          ["Page + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Use a lookup site to read existing lyrics. Use Syllary to turn your own or AI-generated song into the files, page and video a release needs.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "AZLyrics vs Syllary", href: "/compare/azlyrics-vs-syllary" },
          { label: "Genius vs Syllary", href: "/compare/genius-vs-syllary" },
          { label: "LyricFind vs Syllary", href: "/compare/lyricfind-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Is Syllary a lyrics search engine?",
        a: "No — it doesn't look up other artists' lyrics. It creates timed lyric files and pages from your own or AI-generated songs.",
      },
    ],
  },

  // 23 — LyricFind
  {
    slug: "compare/lyricfind-vs-syllary",
    category: "compare",
    renderType: "content",
    title: "LyricFind vs Syllary",
    metaTitle: "LyricFind vs Syllary compared",
    metaDescription:
      "LyricFind is a B2B licensed-lyrics data service for platforms. Syllary is a self-serve tool that turns your own song into timed files, a page and a video.",
    blocks: [
      {
        kind: "paragraph",
        text: "LyricFind is a business-to-business operation: it licenses lyrics from thousands of publishers and supplies that data to apps and platforms, handling tracking and royalties. It's infrastructure, not a tool you'd use to prepare your own release. Syllary is self-serve and the opposite scope: upload your own or AI-generated song and get timed files, a public page and a lyric video.",
      },
      {
        kind: "table",
        headers: ["", "LyricFind", "Syllary"],
        rows: [
          ["Who it's for", "Platforms and apps (B2B)", "Independent artists / AI creators"],
          ["Source", "Licensed publisher catalogs", "Your own / AI songs"],
          ["You get files", "No (data service)", "Yes — full set"],
          ["Page + video", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "If you're building a platform that needs licensed lyric data, that's LyricFind's world. If you're an artist preparing a song, Syllary gives you the files and outputs directly — no licensing deal required, because it's your own work.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Musixmatch vs Syllary", href: "/compare/musixmatch-vs-syllary" },
          { label: "Genius vs Syllary", href: "/compare/genius-vs-syllary" },
          { label: "Lyrics.com vs Syllary", href: "/compare/lyrics-com-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do I need a licensing deal to use Syllary?",
        a: "No — Syllary is for your own or AI-generated songs, so there's no third-party licensing involved.",
      },
    ],
  },

  // 24 — Best LRC generator (roundup)
  {
    slug: "compare/best-lrc-generator",
    category: "compare",
    renderType: "content",
    title: "Best LRC generator in 2026",
    metaTitle: "Best LRC generator in 2026",
    metaDescription:
      "How to choose an LRC generator: auto-sync accuracy, formats, an editor, and outputs beyond files. What to look for, and where Syllary fits.",
    blocks: [
      {
        kind: "paragraph",
        text: "\"Best LRC generator\" depends on what you need after the file. Most good tools now auto-transcribe and sync — so the real differentiators are how easily you can fix mistakes, which formats you can export, and whether you get anything beyond a file. Here's how to judge them, and where Syllary lands.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Auto-sync accuracy — how well it times lines and words to the vocal",
          "A correction editor — fixing a wrong word or timestamp should take seconds",
          "Format coverage — at least LRC, enhanced LRC, SRT, VTT and TTML",
          "Beyond files — a public page and a lyric video, not just downloads",
          "No install, your own/AI songs, and no manual lyric typing",
        ],
      },
      {
        kind: "paragraph",
        text: "If you only ever need a single LRC, a focused generator does the job. If you want one upload to cover every format plus a shareable page and a scene-based video, that's where Syllary is built to lead.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
          { label: "AI LRC Generator vs Syllary", href: "/compare/ai-lrc-generator-vs-syllary" },
          { label: "Best AI lyrics transcription tools", href: "/compare/best-ai-lyrics-transcription-tools" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Do LRC generators need the lyrics typed first?",
        a: "The best ones transcribe from the audio, so you don't have to paste lyrics. Syllary works this way and lets you correct anything quickly.",
      },
    ],
  },

  // 25 — Best lyric video maker (roundup)
  {
    slug: "compare/best-lyric-video-maker",
    category: "compare",
    renderType: "content",
    title: "Best lyric video maker in 2026",
    metaTitle: "Best lyric video maker in 2026",
    metaDescription:
      "Most lyric video makers put text over a background. The honest buying guide: what to look for, the visual styles, and where words-in-the-scene fits.",
    blocks: [
      {
        kind: "paragraph",
        text: "Here's the honest version most roundups skip: nearly every \"lyric video maker\" produces the same thing — words typed over a background or footage, however nicely highlighted. That's a fine, popular style. What varies is whether the words are auto-synced, how the visuals are made, and whether you also get the lyric files you'll need. Use these to compare.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Auto-sync vs hand-placing each line to its timestamp",
          "Visual style: words typed over a background, words built into the scene, or scenes that move",
          "Whether it's stock footage, a visualizer, or generated scenes",
          "Do you also get the synced-lyrics files (LRC/TTML/SRT/VTT)?",
          "Is there a hosted page to share the song, not just a video file?",
        ],
      },
      {
        kind: "paragraph",
        text: "If a classic text-over-background video is all you want, many tools do it well. Syllary's distinct range is the words built into a generated, moving scene — plus the synced files and a public page from the same upload. (A one-continuous-shot mode exists in early beta.)",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Specterr vs Syllary", href: "/compare/specterr-vs-syllary" },
          { label: "Rotor vs Syllary", href: "/compare/rotor-vs-syllary" },
          { label: "EchoWave vs Syllary", href: "/compare/echowave-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "What does \"words built into the scene\" mean?",
        a: "Instead of text sitting on top of a picture, the lyrics are part of the generated image — and in our living-scene mode, the scene moves with the song.",
      },
      {
        q: "Does Syllary make a story music video?",
        a: "No — it makes a lyric visualization, not a narrative film with performers or a plot.",
      },
    ],
  },

  // 26 — Best AI lyrics transcription tools (roundup)
  {
    slug: "compare/best-ai-lyrics-transcription-tools",
    category: "compare",
    renderType: "content",
    title: "Best AI lyrics transcription tools in 2026",
    metaTitle: "Best AI lyrics transcription tools 2026",
    metaDescription:
      "What to look for in an AI tool that pulls lyrics from audio: accuracy, word-level timing, easy corrections, and exports. Where Syllary fits.",
    blocks: [
      {
        kind: "paragraph",
        text: "Getting accurate lyrics out of a song is harder than transcribing speech — vocals overlap with instruments and effects. The best AI lyrics tools isolate the voice, transcribe it, and time each line (ideally each word). When you compare them, weigh accuracy, timing granularity, how fast you can fix errors, and what you can export.",
      },
      {
        kind: "list",
        ordered: false,
        items: [
          "Vocal isolation, so the words aren't lost under the mix",
          "Line and word-level timing, not just a transcript",
          "A fast correction editor for the few words AI gets wrong",
          "Exports: LRC, enhanced LRC, SRT, VTT, TTML, TXT, JSON",
          "Outputs beyond a file — a page and a lyric video",
        ],
      },
      {
        kind: "paragraph",
        text: "If you only need a rough transcript, many tools suffice. If you want transcription, sync and every export combined — plus a page and video — Syllary brings them into one pass.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
          { label: "AI LRC Generator vs Syllary", href: "/compare/ai-lrc-generator-vs-syllary" },
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Why is song transcription harder than speech?",
        a: "Vocals sit inside a full mix with instruments and effects. Isolating the voice first makes the transcript far more accurate, which is how Syllary approaches it.",
      },
    ],
  },

  // 27 — QuickLRC alternative ⚠️
  {
    slug: "compare/quicklrc-alternative",
    category: "compare",
    renderType: "content",
    title: "A QuickLRC alternative",
    metaTitle: "QuickLRC alternative: page + scene video",
    metaDescription:
      "Looking for a QuickLRC alternative? Syllary makes the synced files too — and adds a hosted public page and a lyric video where the words live in the scene.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you like QuickLRC but want more than files, Syllary is the alternative to look at — and it's worth being honest about why. QuickLRC is a strong file maker that even exports a few formats we don't. So the reason to switch isn't \"more formats\"; it's that Syllary turns one upload into the files plus a hosted public song page and a lyric video where the words are built into a moving scene.",
      },
      {
        kind: "table",
        headers: ["Want…", "QuickLRC", "Syllary"],
        rows: [
          ["Just subtitle files", "Great fit", "Also covered"],
          ["A page others can open and sing along to", "No", "Yes"],
          ["A lyric video without a separate editor", "No", "Yes"],
          ["Everything from one upload", "Files only", "Files + page + video"],
        ],
      },
      {
        kind: "callout",
        text: "Being fair: QuickLRC auto-transcribes, has an editor and converters, and exports ASS and TTML. If files are all you need, you may not need an alternative at all. Switch to Syllary when you want the page and the scene-based video too.",
      },
      {
        kind: "paragraph",
        text: "Short version: stay with QuickLRC for pure file work; move to Syllary when you want the lyrics page and the words-in-scene video alongside the files.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "QuickLRC vs Syllary", href: "/compare/quicklrc-vs-syllary" },
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
          { label: "Specterr alternative", href: "/compare/specterr-alternative" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Is Syllary free to try?",
        a: "You can start free. See the pricing on the site for the current free allowance and plans.",
      },
    ],
  },

  // 28 — Musixmatch alternative
  {
    slug: "compare/musixmatch-alternative",
    category: "compare",
    renderType: "content",
    title: "A Musixmatch alternative for artists",
    metaTitle: "Musixmatch alternative for artists",
    metaDescription:
      "Want a Musixmatch alternative? Syllary gives you the timed lyric files you own — every format — plus your own public page and a lyric video.",
    blocks: [
      {
        kind: "paragraph",
        text: "Musixmatch is tied to getting synced lyrics onto streaming platforms after release, through a linked account and catalog. If you'd rather own the actual files and not depend on a platform account, Syllary is the alternative: from your own or AI-generated song it makes timed lyrics in every format, plus a public page and a lyric video you control.",
      },
      {
        kind: "table",
        headers: ["", "Musixmatch", "Syllary"],
        rows: [
          ["You own the files", "Not the focus", "Yes — every format"],
          ["Your own public page", "No", "Yes"],
          ["Lyric video", "No", "Yes"],
          ["Depends on a platform account", "Yes", "No"],
        ],
      },
      {
        kind: "paragraph",
        text: "They can still work together — prepare clean, timed lyrics and files in Syllary, then submit synced lyrics through Musixmatch if you want them shown on Spotify. As an alternative, Syllary is the better home for the files and outputs you keep.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Musixmatch vs Syllary", href: "/compare/musixmatch-vs-syllary" },
          { label: "Genius alternative", href: "/compare/genius-alternative" },
          { label: "Best LRC generator", href: "/compare/best-lrc-generator" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Will my lyrics still show on Spotify?",
        a: "Spotify shows synced lyrics via Musixmatch. Prepare them in Syllary, then submit through Musixmatch after release; check Spotify's current process.",
      },
    ],
  },

  // 29 — Specterr alternative
  {
    slug: "compare/specterr-alternative",
    category: "compare",
    renderType: "content",
    title: "A Specterr alternative",
    metaTitle: "Specterr alternative: words in the scene",
    metaDescription:
      "Want a Specterr alternative? Syllary auto-syncs the lyrics into a moving scene (not text over a visualizer) and exports every lyrics file plus a page.",
    blocks: [
      {
        kind: "paragraph",
        text: "Specterr is a polished visualizer where you drag lyrics to their timestamps over a background. If you want the words synced for you and living inside the scene — not floating over a visualizer — Syllary is the alternative. It transcribes and times the lyrics automatically, builds them into a moving scene, and also gives you the lyrics files and a public page.",
      },
      {
        kind: "table",
        headers: ["Want…", "Specterr", "Syllary"],
        rows: [
          ["Automatic lyric timing", "Hand-placed", "Yes"],
          ["Words inside a moving scene", "Text over a visualizer", "Yes"],
          ["Synced-lyrics files", "No", "Yes — full set"],
          ["A page to share", "No", "Yes"],
        ],
      },
      {
        kind: "paragraph",
        text: "Keep Specterr for its visualizer presets and styling. Choose Syllary when you'd rather not place lyrics by hand and you want the words in the scene plus the files and a page.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Specterr vs Syllary", href: "/compare/specterr-vs-syllary" },
          { label: "EchoWave vs Syllary", href: "/compare/echowave-vs-syllary" },
          { label: "Best lyric video maker", href: "/compare/best-lyric-video-maker" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Can I still customize the look?",
        a: "Yes — you choose the visual style for the scene. The key difference is the words are synced for you and built into the scene rather than placed over a visualizer.",
      },
    ],
  },

  // 30 — Genius alternative (for your own songs)
  {
    slug: "compare/genius-alternative",
    category: "compare",
    renderType: "content",
    title: "A Genius alternative for your own songs",
    metaTitle: "Genius alternative for your own songs",
    metaDescription:
      "Want a Genius alternative to host your own song's lyrics? Syllary publishes an opt-in, synced lyrics page for your own or AI-generated songs — legally.",
    blocks: [
      {
        kind: "paragraph",
        text: "Genius hosts lyrics for commercial catalogs you don't own. If what you actually want is a place to publish your own song's lyrics — legally, and looking great — Syllary is the alternative. It creates a hosted, opt-in public page for your own or AI-generated song, with a synced reader listeners can follow, plus downloads and a lyric video.",
      },
      {
        kind: "table",
        headers: ["", "Genius", "Syllary"],
        rows: [
          ["Whose songs", "Commercial catalog", "Your own / AI-generated"],
          ["Synced reader", "No", "Yes — listen and follow along"],
          ["Downloads + video", "No", "Yes"],
          ["You control the page", "No", "Yes (opt-in)"],
        ],
      },
      {
        kind: "paragraph",
        text: "This is the safe, legal way to get a Genius-style page for your music: it's your own work, you opt in to publishing, and you get a synced page plus all the files. Don't build pages around other artists' copyrighted songs.",
      },
      {
        kind: "relatedLinks",
        title: "Related comparisons",
        items: [
          { label: "Genius vs Syllary", href: "/compare/genius-vs-syllary" },
          { label: "AZLyrics vs Syllary", href: "/compare/azlyrics-vs-syllary" },
          { label: "Musixmatch alternative", href: "/compare/musixmatch-alternative" },
        ],
      },
      cta,
    ],
    faq: [
      {
        q: "Is it legal to host my lyrics this way?",
        a: "Yes, for your own or AI-generated songs, with an opt-in rights affirmation. Public pages aren't for other artists' copyrighted recordings.",
      },
    ],
  },
];
