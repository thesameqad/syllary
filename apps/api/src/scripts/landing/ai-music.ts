import { type SeedPage, UNIVERSAL_CTA } from "./types.js";

// Bucket 5 — AI-music / Downstream pages (#131–150). Strictly the user's own or
// AI-generated songs — never commercial covers or popular-artist content. All
// under /guides/. Verified June 2026: Suno/Udio/Sonauto/Mureka/Riffusion all
// let you export downloadable audio of your own generations.

const cta = UNIVERSAL_CTA;

const ownAiCallout = {
  kind: "callout" as const,
  text: "This is for your own AI-generated songs. Don't make lyric files or pages from other artists' copyrighted recordings or AI covers of commercial songs.",
};

export const AI_MUSIC_PAGES: SeedPage[] = [
  // 131
  {
    slug: "guides/lyrics-file-for-your-suno-song",
    category: "guides",
    renderType: "content",
    title: "How to make a lyrics file for your Suno song",
    metaTitle: "Lyrics file for your Suno song",
    metaDescription:
      "Turn your Suno track into timed lyric files. Even if you have the words, Syllary times them to your exact audio and exports every format.",
    blocks: [
      {
        kind: "paragraph",
        text: "Suno gives you the audio of your generated song, and usually the lyrics text too. What it doesn't give you is a file timed precisely to your exact track in every format a release needs. Upload your Suno audio and get that — synced, accurate, and exportable.",
      },
      {
        kind: "steps",
        items: [
          { title: "Export your Suno track", text: "Download the audio of your own generation." },
          { title: "Upload it here", text: "The lyrics are timed to your exact audio." },
          { title: "Export every format", text: "LRC, TTML, SRT, VTT, TXT and JSON." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Suno track to LRC", href: "/guides/suno-track-to-lrc" },
          { label: "Make a lyric video for your Suno track", href: "/guides/lyric-video-for-your-suno-track" },
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "I already have the lyrics from Suno — why time them here?", a: "Having the words isn't the same as a file timed to your exact audio. Syllary syncs them and exports every format." },
    ],
  },

  // 132
  {
    slug: "guides/suno-track-to-lrc",
    category: "guides",
    renderType: "content",
    title: "How to turn a Suno track into an LRC",
    metaTitle: "Suno track to LRC",
    metaDescription:
      "Export your Suno song's audio and turn it into a synced .lrc for players and local files. Timed to your exact track, in minutes.",
    blocks: [
      {
        kind: "paragraph",
        text: "Want your Suno song to show synced lyrics in a music player? Export the audio and convert it to an LRC here — the lines are timed to your specific track, ready to drop next to the file.",
      },
      {
        kind: "steps",
        items: [
          { title: "Download your Suno audio", text: "Your own generated song." },
          { title: "Upload and sync", text: "Get an LRC timed to the audio." },
          { title: "Use it as a sidecar", text: "Place the .lrc next to your file for players." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Lyrics file for your Suno song", href: "/guides/lyrics-file-for-your-suno-song" },
          { label: "Add lyrics to local music files", href: "/guides/add-lyrics-to-local-music-files" },
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will it match my exact Suno version?", a: "Yes — timing is measured from the audio you upload, so it matches that exact track." },
    ],
  },

  // 133
  {
    slug: "guides/lyric-video-for-your-suno-track",
    category: "guides",
    renderType: "content",
    title: "How to make a lyric video for your Suno track",
    metaTitle: "Make a lyric video for your Suno track",
    metaDescription:
      "Turn your Suno song into a synced lyric video where the words live inside a moving scene. Upload the audio and generate it — visualization, not a film.",
    blocks: [
      {
        kind: "paragraph",
        text: "Your Suno track deserves more than text on a stock background. Upload the audio and generate a lyric video where the words are built into a moving scene, synced to the song. It's a visualization of the lyrics, not a narrative music video.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your Suno audio", text: "Lyrics are transcribed and timed." },
          { title: "Pick the look", text: "Words over a background, in the scene, or scenes that move." },
          { title: "Generate the video", text: "Synced to your track, ready to share." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Lyrics file for your Suno song", href: "/guides/lyrics-file-for-your-suno-song" },
          { label: "How to make a lyric video", href: "/guides/how-to-make-a-lyric-video" },
          { label: "Lyric video for your AI album", href: "/guides/lyric-video-for-your-ai-album" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is it a full music video?", a: "No — it's a lyric visualization. The words are the focus, built into a scene, not a story film." },
    ],
  },

  // 134
  {
    slug: "guides/add-synced-lyrics-to-your-suno-song-on-spotify",
    category: "guides",
    renderType: "content",
    title: "How to add synced lyrics to your Suno song on Spotify",
    metaTitle: "Synced lyrics for your Suno song on Spotify",
    metaDescription:
      "Distributing your Suno song to Spotify? Prepare accurate, timed lyrics first, then add them via Musixmatch after release. Here's the flow.",
    blocks: [
      {
        kind: "paragraph",
        text: "If you're releasing your Suno song to Spotify through a distributor, synced lyrics are added the same way as any track: prepare accurate, timed lyrics first, then submit them through Musixmatch once the song is live.",
      },
      {
        kind: "steps",
        items: [
          { title: "Time your lyrics", text: "Upload your Suno audio and sync the words." },
          { title: "Distribute the song", text: "Release it to Spotify through your distributor." },
          { title: "Submit via Musixmatch", text: "Add the synced lyrics after the track is live." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Add synced lyrics to Spotify", href: "/guides/how-to-add-synced-lyrics-to-spotify" },
          { label: "Get TTML for your Suno song", href: "/guides/get-ttml-for-your-suno-song" },
          { label: "From Suno prompt to released song with lyrics", href: "/guides/suno-prompt-to-released-song-with-lyrics" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I do this before release?", a: "Prepare the timed lyrics anytime; submitting to Spotify via Musixmatch happens after the track is live." },
    ],
  },

  // 135
  {
    slug: "guides/get-ttml-for-your-suno-song",
    category: "guides",
    renderType: "content",
    title: "How to get TTML for your Suno song (Apple Music)",
    metaTitle: "Get TTML for your Suno song (Apple Music)",
    metaDescription:
      "Apple Music needs TTML for time-synced lyrics. Generate it from your Suno track and hand it to your distributor with the release.",
    blocks: [
      {
        kind: "paragraph",
        text: "To show time-synced lyrics on Apple Music, your distributor delivers a TTML file. Generate that file from your Suno song — timed to the exact master you're releasing — and provide it with your release.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your release master", text: "The exact Suno track you'll distribute." },
          { title: "Export TTML", text: "Get the Apple-ready timed-lyrics file." },
          { title: "Deliver via your distributor", text: "Provide the .ttml with the release." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a TTML file for Apple Music", href: "/guides/how-to-make-a-ttml-file-for-apple-music" },
          { label: "Add synced lyrics to your Suno song on Spotify", href: "/guides/add-synced-lyrics-to-your-suno-song-on-spotify" },
          { label: "Get your AI song's lyrics timed for distribution", href: "/guides/ai-song-lyrics-timed-for-distribution" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does Apple take the TTML from me?", a: "No — your distributor delivers it. You produce the file and hand it over." },
    ],
  },

  // 136
  {
    slug: "guides/udio-track-to-lrc",
    category: "guides",
    renderType: "content",
    title: "How to turn a Udio track into an LRC",
    metaTitle: "Udio track to LRC",
    metaDescription:
      "Export your Udio song's audio and turn it into a synced .lrc — timed to your exact track and ready for players and local files.",
    blocks: [
      {
        kind: "paragraph",
        text: "Made a song in Udio? Export the audio and turn it into a synced LRC here. The lines are timed to your specific track, so it scrolls correctly in any compatible player.",
      },
      {
        kind: "steps",
        items: [
          { title: "Download your Udio audio", text: "Your own generated track." },
          { title: "Upload and sync", text: "Get a timed LRC back." },
          { title: "Export more if needed", text: "TTML, SRT, VTT and the rest too." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make a lyric video for your Udio track", href: "/guides/lyric-video-for-your-udio-track" },
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
          { label: "Convert audio to LRC", href: "/convert/audio-to-lrc" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need the lyrics written?", a: "No — they're transcribed from your Udio audio and timed automatically." },
    ],
  },

  // 137
  {
    slug: "guides/lyric-video-for-your-udio-track",
    category: "guides",
    renderType: "content",
    title: "How to make a lyric video for your Udio track",
    metaTitle: "Make a lyric video for your Udio track",
    metaDescription:
      "Turn your Udio song into a synced lyric video where the words live inside a moving scene. Upload the audio and generate it.",
    blocks: [
      {
        kind: "paragraph",
        text: "Give your Udio song a visual. Upload the audio and generate a lyric video with the words built into a moving scene and synced to the track — a visualization of the lyrics, not a story film.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your Udio audio", text: "Lyrics get transcribed and timed." },
          { title: "Choose the visual style", text: "From a background to a scene that moves." },
          { title: "Generate and share", text: "Your synced lyric video is ready." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Udio track to LRC", href: "/guides/udio-track-to-lrc" },
          { label: "How to make a lyric video", href: "/guides/how-to-make-a-lyric-video" },
          { label: "Make a lyric video for your Suno track", href: "/guides/lyric-video-for-your-suno-track" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will the words match the music?", a: "Yes — they're synced to the audio you upload, so they appear when they're sung." },
    ],
  },

  // 138
  {
    slug: "guides/export-lyrics-from-your-ai-song",
    category: "guides",
    renderType: "content",
    title: "How to export lyrics from your AI song",
    metaTitle: "Export lyrics from your AI song",
    metaDescription:
      "Whatever tool made your AI song, export its audio and get timed lyrics in every format — no lyric sheet needed.",
    blocks: [
      {
        kind: "paragraph",
        text: "AI music tools hand you audio, not a tidy set of lyric files. Whichever one you used, export the track and turn it into timed lyrics here — the words are transcribed from the audio, so you don't need a sheet.",
      },
      {
        kind: "steps",
        items: [
          { title: "Export your AI track", text: "Audio from your own generation." },
          { title: "Upload it", text: "Lyrics are transcribed and timed." },
          { title: "Export every format", text: "Players, streaming, video and data." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make synced lyrics for AI music", href: "/guides/make-synced-lyrics-for-ai-music" },
          { label: "Get your AI song's lyrics timed for distribution", href: "/guides/ai-song-lyrics-timed-for-distribution" },
          { label: "Export every lyrics format at once", href: "/guides/export-every-lyrics-format-at-once" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Does it work with any AI music tool?", a: "Yes — if you can export the audio of your own generation, you can turn it into timed lyrics here." },
    ],
  },

  // 139
  {
    slug: "guides/make-synced-lyrics-for-ai-music",
    category: "guides",
    renderType: "content",
    title: "How to make synced lyrics for AI-generated music",
    metaTitle: "Synced lyrics for AI-generated music",
    metaDescription:
      "AI vocals sync just like any recording. Upload your AI song and get accurate, timed lyrics — then export or publish.",
    blocks: [
      {
        kind: "paragraph",
        text: "Synced lyrics work the same for AI-generated vocals as for any recording: the voice is isolated, transcribed, and timed to the audio. Upload your AI song and you get accurate synced lyrics to export or publish.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your AI song", text: "The AI vocal is transcribed and timed." },
          { title: "Review the result", text: "Fix any word the model misheard." },
          { title: "Export or publish", text: "Files, a page, or a lyric video." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
          { label: "Make synced lyrics without typing", href: "/guides/make-synced-lyrics-without-typing" },
          { label: "Transcribe song lyrics from audio", href: "/guides/transcribe-song-lyrics-from-audio" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Are AI vocals harder to transcribe?", a: "Not particularly — clear AI vocals often transcribe well, and you can correct anything in the editor." },
    ],
  },

  // 140
  {
    slug: "guides/public-lyrics-page-for-your-suno-song",
    category: "guides",
    renderType: "content",
    title: "How to make a public lyrics page for your Suno song",
    metaTitle: "Public lyrics page for your Suno song",
    metaDescription:
      "Give your Suno song a home: an opt-in public page with a synced reader, downloads, links and a video — so others can listen and sing along.",
    blocks: [
      {
        kind: "paragraph",
        text: "A Suno song with no home is hard to share. Publish an opt-in public page where listeners read along in time, grab the files, follow streaming links and watch the lyric video — all in one place, for your own AI song.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your Suno track", text: "Get the synced lyrics ready." },
          { title: "Publish the page", text: "Opt in, confirming it's your own AI song." },
          { title: "Share the link", text: "Listeners follow along and explore." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Create a public lyrics page", href: "/guides/create-a-public-lyrics-page" },
          { label: "Karaoke page for your AI song", href: "/guides/karaoke-page-for-your-ai-song" },
          { label: "Turn your Suno song into a full lyrics page", href: "/guides/suno-song-to-full-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Is this allowed for AI songs?", a: "Yes — public pages are for your own or AI-generated songs, with an opt-in rights affirmation." },
    ],
  },

  // 141
  {
    slug: "guides/karaoke-page-for-your-ai-song",
    category: "guides",
    renderType: "content",
    title: "How to make a karaoke page for your AI song",
    metaTitle: "Karaoke page for your AI song",
    metaDescription:
      "Publish a sing-along page for your AI song with word-by-word highlighting, so listeners can follow the lyrics in time.",
    blocks: [
      {
        kind: "paragraph",
        text: "A karaoke page lets people sing along to your AI song online, with the words lighting up as they're sung. From your timed lyrics, publish a public page that highlights word by word.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your AI song", text: "Get word-level timing." },
          { title: "Publish the karaoke page", text: "Opt in for your own AI song." },
          { title: "Share it", text: "Listeners follow the highlighted lyrics." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Public lyrics page for your Suno song", href: "/guides/public-lyrics-page-for-your-suno-song" },
          { label: "Make karaoke lyrics from a song", href: "/guides/make-karaoke-lyrics-from-a-song" },
          { label: "Word-by-word karaoke highlighting", href: "/guides/word-by-word-karaoke-highlighting" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do listeners need an app?", a: "No — the karaoke page runs in the browser; they just open the link and follow along." },
    ],
  },

  // 142
  {
    slug: "guides/sonauto-track-to-lyrics-files",
    category: "guides",
    renderType: "content",
    title: "How to turn a Sonauto track into lyrics files",
    metaTitle: "Sonauto track to lyrics files",
    metaDescription:
      "Export your Sonauto song's audio and turn it into timed lyric files — LRC, TTML, SRT and more — synced to your exact track.",
    blocks: [
      {
        kind: "paragraph",
        text: "Sonauto lets you download your generated tracks. Take that audio and turn it into timed lyric files here — synced to your specific song and exportable in every common format.",
      },
      {
        kind: "steps",
        items: [
          { title: "Download your Sonauto track", text: "Your own generated audio." },
          { title: "Upload and sync", text: "Lyrics are timed to the audio." },
          { title: "Export the files", text: "LRC, TTML, SRT, VTT, TXT, JSON." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
          { label: "Mureka song to LRC and lyric video", href: "/guides/mureka-song-to-lrc-lyric-video" },
          { label: "Make synced lyrics for AI music", href: "/guides/make-synced-lyrics-for-ai-music" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Which formats can I get?", a: "All of them — LRC, enhanced LRC, TTML, SRT, VTT, TXT and JSON, from one upload." },
    ],
  },

  // 143
  {
    slug: "guides/mureka-song-to-lrc-lyric-video",
    category: "guides",
    renderType: "content",
    title: "How to turn a Mureka song into an LRC and a lyric video",
    metaTitle: "Mureka song to LRC and lyric video",
    metaDescription:
      "Export your Mureka track and get a synced .lrc plus a lyric video where the words live in the scene — all from one upload.",
    blocks: [
      {
        kind: "paragraph",
        text: "Made a song in Mureka? Download the track, then turn it into a synced LRC and a lyric video here. The words are timed to your audio and, for the video, built into a moving scene.",
      },
      {
        kind: "steps",
        items: [
          { title: "Download your Mureka track", text: "Your own generated song." },
          { title: "Upload it", text: "Lyrics are transcribed and timed." },
          { title: "Get the LRC and video", text: "Plus every other format from the same upload." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Sonauto track to lyrics files", href: "/guides/sonauto-track-to-lyrics-files" },
          { label: "Riffusion track to synced lyrics", href: "/guides/riffusion-track-to-synced-lyrics" },
          { label: "How to make a lyric video", href: "/guides/how-to-make-a-lyric-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I get just the LRC?", a: "Yes — the video is optional. Export only the files you want." },
    ],
  },

  // 144
  {
    slug: "guides/riffusion-track-to-synced-lyrics",
    category: "guides",
    renderType: "content",
    title: "How to turn a Riffusion track into synced lyrics",
    metaTitle: "Riffusion track to synced lyrics",
    metaDescription:
      "Export your Riffusion song's audio and turn it into synced lyrics in every format — timed to your exact track.",
    blocks: [
      {
        kind: "paragraph",
        text: "Riffusion lets you download your generated tracks. Bring that audio here to get synced lyrics — transcribed from the vocal and timed to your specific song, ready to export.",
      },
      {
        kind: "steps",
        items: [
          { title: "Download your Riffusion track", text: "Your own generated audio." },
          { title: "Upload and sync", text: "Get accurate, timed lyrics." },
          { title: "Export what you need", text: "Files, a page, or a lyric video." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Export lyrics from your AI song", href: "/guides/export-lyrics-from-your-ai-song" },
          { label: "Make synced lyrics for AI music", href: "/guides/make-synced-lyrics-for-ai-music" },
          { label: "Mureka song to LRC and lyric video", href: "/guides/mureka-song-to-lrc-lyric-video" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I need the lyrics written first?", a: "No — they're transcribed from your track and timed automatically." },
    ],
  },

  // 145
  {
    slug: "guides/ai-song-lyrics-timed-for-distribution",
    category: "guides",
    renderType: "content",
    title: "How to get your AI song's lyrics timed for distribution",
    metaTitle: "AI song lyrics timed for distribution",
    metaDescription:
      "Distributing your AI song? Time the lyrics to your exact master and export the formats platforms need — TTML for Apple, and the rest.",
    blocks: [
      {
        kind: "paragraph",
        text: "Distributing an AI song works like any release: the lyrics need to be accurate, timed to the exact master, and exported in the formats platforms expect. Upload your track and prepare all of it in one pass.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your release master", text: "The exact AI track you'll distribute." },
          { title: "Time and correct the lyrics", text: "Match the vocal precisely." },
          { title: "Export the formats", text: "TTML for Apple; LRC/SRT/VTT for the rest." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Prepare synced lyrics for distribution", href: "/guides/prepare-synced-lyrics-for-distribution" },
          { label: "Get TTML for your Suno song", href: "/guides/get-ttml-for-your-suno-song" },
          { label: "Lyric files for streaming platforms", href: "/guides/lyric-files-for-streaming-platforms" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Same process as a normal release?", a: "Yes — the only difference is the song is AI-generated and yours. The lyric prep is identical." },
    ],
  },

  // 146
  {
    slug: "guides/suno-prompt-to-released-song-with-lyrics",
    category: "guides",
    renderType: "content",
    title: "From Suno prompt to a released song with lyrics",
    metaTitle: "Suno prompt to a released song with lyrics",
    metaDescription:
      "The end-to-end path: generate in Suno, distribute, and add timed lyrics in every format. A simple overview for your own AI songs.",
    blocks: [
      {
        kind: "paragraph",
        text: "Here's the whole journey for one of your AI songs: generate it, distribute it, and give it proper synced lyrics. Each step is simple; this ties them together.",
      },
      {
        kind: "steps",
        items: [
          { title: "Generate in Suno", text: "Create your song and export the audio." },
          { title: "Distribute it", text: "Release through your distributor of choice." },
          { title: "Add timed lyrics", text: "Sync and export every format; submit synced lyrics per platform." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Add synced lyrics to your Suno song on Spotify", href: "/guides/add-synced-lyrics-to-your-suno-song-on-spotify" },
          { label: "Get TTML for your Suno song", href: "/guides/get-ttml-for-your-suno-song" },
          { label: "Turn your Suno song into a full lyrics page", href: "/guides/suno-song-to-full-lyrics-page" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Do I add lyrics before or after release?", a: "Prepare them anytime; platform submission (like Spotify via Musixmatch) happens after the track is live." },
    ],
  },

  // 147
  {
    slug: "guides/lyric-video-for-your-ai-album",
    category: "guides",
    renderType: "content",
    title: "How to make lyric videos for your AI album",
    metaTitle: "Lyric videos for your AI album",
    metaDescription:
      "Make a lyric video for every track on your AI album. Organize by album, then generate a synced, words-in-the-scene video per song.",
    blocks: [
      {
        kind: "paragraph",
        text: "A full AI album is more shareable with a video per track. Organize the album, then generate a synced lyric video for each song — the words built into a moving scene, consistent across the release.",
      },
      {
        kind: "steps",
        items: [
          { title: "Organize the album", text: "Group your tracks by artist and album." },
          { title: "Process each song", text: "Get timed lyrics per track." },
          { title: "Generate a video each", text: "A words-in-the-scene video for every song." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Organize your AI music by artist/album", href: "/guides/organize-your-ai-music" },
          { label: "Make a lyric video for your Suno track", href: "/guides/lyric-video-for-your-suno-track" },
          { label: "Create lyrics files for an album", href: "/guides/create-lyrics-files-for-an-album" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can the videos share a look?", a: "Yes — choose a consistent visual style across the album's tracks." },
    ],
  },

  // 148
  {
    slug: "guides/organize-your-ai-music",
    category: "guides",
    renderType: "content",
    title: "How to organize your AI music by artist and album",
    metaTitle: "Organize your AI music by artist/album",
    metaDescription:
      "Working with several AI artists or albums? Organize your catalog so each artist, album and track stays grouped — and the lyric work scales.",
    blocks: [
      {
        kind: "paragraph",
        text: "AI creators often run multiple \"artists\" and albums. Keeping them organized — artists, their albums, and each track — makes the lyric workflow scale, with covers, links and files grouped per release.",
      },
      {
        kind: "steps",
        items: [
          { title: "Create your artists", text: "Each AI persona gets its own space." },
          { title: "Add albums and tracks", text: "Group songs under the right release." },
          { title: "Work per track", text: "Lyrics, files, pages and videos, all grouped." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Create lyrics files for an album", href: "/guides/create-lyrics-files-for-an-album" },
          { label: "Import an album and add lyrics", href: "/guides/import-an-album-and-add-lyrics" },
          { label: "Lyric video for your AI album", href: "/guides/lyric-video-for-your-ai-album" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Can I manage several AI artists?", a: "Yes — organize by artist and album so each project stays separate and easy to manage." },
    ],
  },

  // 149
  {
    slug: "guides/captions-for-ai-music-on-youtube",
    category: "guides",
    renderType: "content",
    title: "How to make captions for your AI music on YouTube",
    metaTitle: "Captions for your AI music on YouTube",
    metaDescription:
      "Uploading your AI song to YouTube? Generate an SRT from the lyrics and add it so viewers get accurate captions.",
    blocks: [
      {
        kind: "paragraph",
        text: "Captions make your AI music video accessible and watchable on mute. Generate an SRT from the song's lyrics and add it to your YouTube upload — no typing captions by hand.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your AI song", text: "Get the lyrics transcribed and timed." },
          { title: "Export an SRT", text: "The subtitle file YouTube accepts." },
          { title: "Add it to your video", text: "Upload the SRT in YouTube Studio." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Make subtitles for a song on YouTube", href: "/guides/make-subtitles-for-a-song-on-youtube" },
          { label: "Add captions to a music video", href: "/guides/add-captions-to-a-music-video" },
          { label: "Convert a song to subtitles", href: "/convert/song-to-subtitles" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "Will the captions be accurate?", a: "They come from your song's transcribed lyrics, and you can correct anything before exporting." },
    ],
  },

  // 150
  {
    slug: "guides/suno-song-to-full-lyrics-page",
    category: "guides",
    renderType: "content",
    title: "Turn your Suno song into a full lyrics page",
    metaTitle: "Turn your Suno song into a full lyrics page",
    metaDescription:
      "From one Suno upload: synced lyrics, a summary, a cover, streaming links and a lyric video — bundled on one shareable page.",
    blocks: [
      {
        kind: "paragraph",
        text: "This is the showcase: upload your Suno song once and let nearly everything be generated for you — the lyrics transcribed and synced, a summary written, a cover made, streaming links found, and a lyric video built — all bundled on a single public page.",
      },
      {
        kind: "steps",
        items: [
          { title: "Upload your Suno track", text: "Your own AI song." },
          { title: "Let it build the pieces", text: "Lyrics, summary, cover, links and a video." },
          { title: "Publish the page", text: "One link with everything, ready to share." },
        ],
      },
      ownAiCallout,
      {
        kind: "relatedLinks",
        title: "Related",
        items: [
          { label: "Public lyrics page for your Suno song", href: "/guides/public-lyrics-page-for-your-suno-song" },
          { label: "Make a lyrics page with streaming links", href: "/guides/lyrics-page-with-streaming-links" },
          { label: "Make a lyric video for your Suno track", href: "/guides/lyric-video-for-your-suno-track" },
        ],
      },
      cta,
    ],
    faq: [
      { q: "How much is automatic?", a: "Most of it — transcription, sync, summary, cover, links and video. You review and publish." },
    ],
  },
];
