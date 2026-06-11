import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { StaticPage } from "./static-page";

/** Plain-text answers power the FAQPage JSON-LD; rich answers render on page. */
const FAQS: { q: string; a: string; rich?: ReactNode }[] = [
  {
    q: "What lyric file formats do I get?",
    a: "Every upload can be exported as .lrc, enhanced .lrc (word-level timing), .ttml, .srt, .vtt, plain .txt, and .json — all generated from the same synced transcription, ready for players, video editors, karaoke apps, and distributor workflows.",
  },
  {
    q: "What are tokens and how much does one song cost?",
    a: "Tokens are Syllary's usage credits. Generating synced lyrics for a typical song costs roughly 300–600 tokens depending on its length and the accuracy mode you pick; the exact price is always shown before you confirm. Lyric videos cost more because AI image and motion generation is expensive — again, you see the exact token price first.",
  },
  {
    q: "Is the free plan really free?",
    a: "Yes. Signing up gives you 1,000 tokens (no card required) — enough to generate synced lyric files for a few songs — and a library that holds up to 3 songs. Visitors can even try one short track without an account.",
  },
  {
    q: "How accurate is the transcription and sync?",
    a: "We isolate the vocals first, then transcribe with a state-of-the-art speech model, so accuracy is high — but no AI is perfect. The built-in editor lets you fix any word and the timing stays synced, so the files you export are exactly right.",
  },
  {
    q: "Can Syllary make a lyric video of my song?",
    a: "Yes — three styles: Slideshow (AI scene per line with gentle motion), Living Scenes (each line becomes a moving shot), and Cinematic (one continuous AI-directed film). You can render a short preview before committing to the full video, and the token cost is shown up front.",
  },
  {
    q: "Who owns the files and videos Syllary creates?",
    a: "You do. Your audio, the lyric files, and the generated videos are yours. We only ask for the rights needed to process and store them for you.",
  },
  {
    q: "Does it work with AI-generated music like Suno or Udio?",
    a: "Perfectly — AI musicians are some of our heaviest users. Upload the track you exported, get synced lyrics and a video. One note: what you may do commercially with an AI-generated song (e.g. monetised YouTube uploads) depends on the AI music platform's plan you created it under, so check their terms.",
  },
  {
    q: "How do synced lyrics actually get onto Spotify or Apple Music?",
    a: "It depends on your distributor. Some accept lyric files directly with your release; for others, Spotify lyrics flow through Musixmatch and Apple Music has its own pipeline, where you paste or sync lyrics in their tools — our plain-text and synced exports make that step copy-paste simple. Our guides walk through the exact path for each platform, and the same files work everywhere else: YouTube captions, karaoke apps, players, and video editors.",
  },
  {
    q: "What's the maximum song length or file size?",
    a: "Uploads can be MP3, WAV, or FLAC up to 60MB. Signed-in users have no duration limit — token pricing simply scales with length. Anonymous trial uploads are capped at 3 minutes.",
  },
  {
    q: "How do I cancel or get a refund?",
    a: "Cancel any time from the billing portal in your account — your plan runs to the end of the paid period. First payments are refundable within 14 days, and tokens charged for any failed generation are refunded automatically.",
  },
];

export function FaqPage() {
  return (
    <StaticPage
      title="Frequently Asked Questions"
      description="Quick answers about Syllary's lyric files, lyric videos, tokens, plans, and refunds."
      jsonLd={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: FAQS.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }}
    >
      {FAQS.map((f) => (
        <section key={f.q}>
          <h2>{f.q}</h2>
          <p>{f.rich ?? f.a}</p>
        </section>
      ))}
      <section>
        <h2>Something else?</h2>
        <p>
          Ask us directly via the <Link to="/contact">contact form</Link> or{" "}
          <a href="mailto:hello@syllary.com">hello@syllary.com</a> — the founder reads every
          message.
        </p>
      </section>
    </StaticPage>
  );
}
