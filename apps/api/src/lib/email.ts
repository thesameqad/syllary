import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { emailLog, users, type UserRow } from "../db/schema.js";
import { env } from "../env.js";

/** Lifecycle email for Syllary, sent through Resend's REST API (no SDK).
 *  - No RESEND_API_KEY → sends are skipped quietly (local dev).
 *  - Every send is deduped via email_log's unique (userId, kind), so event
 *    hooks and the drip poller can both fire without double-sending.
 *  - Drip/nudge emails respect users.emailOptOut and carry an unsubscribe
 *    link; transactional ones (welcome, song-ready) don't need one. */

const BRAND = {
  bg: "#FAFAF7", // Paper
  card: "#ffffff",
  text: "#1a1a1a",
  mute: "#777777",
  red: "#D81818", // Ember — red on light backgrounds
};

function layout(body: string, opts: { unsubscribeUrl?: string } = {}): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,Segoe UI,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${BRAND.card};border-radius:14px;padding:36px 36px 28px;text-align:left;">
      <tr><td>
        <div style="margin-bottom:24px;">
          <img src="${env.R2_PUBLIC_URL.replace(/\/$/, "")}/assets/email-logo.png" alt="syllary" height="36" style="height:36px;width:auto;border:0;" />
        </div>
        ${body}
      </td></tr>
    </table>
    <div style="max-width:520px;padding:18px 8px;font-size:12px;color:${BRAND.mute};text-align:center;">
      Syllary · synced lyrics &amp; lyric videos · <a href="${env.APP_URL}" style="color:${BRAND.mute};">syllary.com</a>
      ${opts.unsubscribeUrl ? ` · <a href="${opts.unsubscribeUrl}" style="color:${BRAND.mute};">unsubscribe</a>` : ""}
    </div>
  </td></tr></table>
</body></html>`;
}

const p = (t: string) => `<p style="font-size:15px;line-height:1.65;color:${BRAND.text};margin:0 0 14px;">${t}</p>`;
const muted = (t: string) => `<p style="font-size:13px;line-height:1.6;color:${BRAND.mute};margin:18px 0 0;">${t}</p>`;
const button = (href: string, label: string) =>
  `<p style="margin:22px 0;"><a href="${href}" style="background:${BRAND.red};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 22px;border-radius:10px;display:inline-block;">${label}</a></p>`;

/** HMAC token so the unsubscribe link can't be forged for other users. */
export function unsubscribeToken(userId: string): string {
  return createHmac("sha256", env.IP_HASH_SALT).update(`unsub:${userId}`).digest("hex").slice(0, 32);
}

function unsubscribeUrl(userId: string): string {
  // Routes through the web app (which knows the API host) — the API itself
  // lives on a different domain in production.
  return `${env.APP_URL.replace(/\/$/, "")}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;
}

async function deliver(to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Send once per (user, kind): claims the email_log row first (unique index =
 *  the lock), then delivers. If delivery fails the claim is rolled back so a
 *  later attempt can retry. Never throws. */
export async function sendOnce(
  user: Pick<UserRow, "id" | "email" | "emailOptOut">,
  kind: string,
  build: () => { subject: string; html: string },
  opts: { marketing?: boolean } = {},
): Promise<void> {
  try {
    if (!user.email || !env.RESEND_API_KEY) return;
    if (opts.marketing && user.emailOptOut) return;
    const [claimed] = await db
      .insert(emailLog)
      .values({ userId: user.id, kind })
      .onConflictDoNothing()
      .returning();
    if (!claimed) return; // already sent (or another worker is sending)
    const { subject, html } = build();
    const ok = await deliver(user.email, subject, html);
    if (!ok) {
      await db
        .delete(emailLog)
        .where(and(eq(emailLog.userId, user.id), eq(emailLog.kind, kind)));
    }
  } catch {
    // email must never break a request
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function welcomeEmail(): { subject: string; html: string } {
  return {
    subject: "Welcome to Syllary! Your first songs are on us",
    html: layout(
      p("Welcome! You've got <strong>1,000 tokens</strong> on the house. That's enough to turn a few songs into perfectly synced lyric files.") +
        p("Upload a track and about a minute later you'll have every format the platforms use: .lrc, enhanced .lrc, .ttml, .srt, .vtt, .txt and .json. You also get a karaoke-style player page you can share.") +
        button(`${env.APP_URL}/upload`, "Upload your first song") +
        muted("Tip: the built-in editor lets you fix any word without losing sync."),
    ),
  };
}

export function songReadyEmail(songId: string, title: string): { subject: string; html: string } {
  const url = `${env.APP_URL}/s/${songId}`;
  return {
    subject: `“${title}” is ready. Come listen`,
    html: layout(
      p(`Good news: <strong>${title}</strong> just finished processing. Every line is synced, word by word, and ready to play.`) +
        p("Before you ship it anywhere, hit play once and read along. We work hard to get the transcription as close to perfect as we can, but AI still mishears a mumbled word or an odd rhyme now and then. If something's off, fix the word or nudge the timing right in the editor. Or regenerate the track in a different mode and let it take another swing.") +
        p("Once every line sits where it should, the fun part: turn the song into a lyric video. And when you love how it all looks, make your page public and share it.") +
        button(url, "Listen & check the lyrics") +
        muted("All the files (.lrc, .ttml, .srt, .vtt, .txt, .json) are ready to download whenever you need them."),
    ),
  };
}

export function tokenLowEmail(balance: number): { subject: string; html: string } {
  return {
    subject: "Heads up: your token jar is nearly empty",
    html: layout(
      p(`Hey! Tiny heads-up from your friendly token counter: you're down to <strong>${balance} tokens</strong>. In music terms that's roughly one more song before things stop mid-chorus. Nobody wants that.`) +
        p("If you're wrapping up for now, ignore us entirely. If you're on a roll, plans start at <strong>$6 a month</strong> and refill the jar on their own, so pick whichever matches your pace.") +
        button(`${env.APP_URL}/upgrade`, "Refill your tokens") +
        muted("Exactly what each plan buys is laid out on the pricing page. No surprises. Promise."),
    ),
  };
}

/** Day-2 nudge: the user has a finished song but no video yet. */
export function buildDripVideo(userId: string, songId: string | null, title: string | null) {
  const target = songId ? `${env.APP_URL}/s/${songId}` : `${env.APP_URL}/upload`;
  return {
    subject: title ? `Turn “${title}” into a lyric video` : "Your song deserves a lyric video",
    html: layout(
      p(title
        ? `Your lyrics for <strong>${title}</strong> are already synced. That puts a lyric video about three clicks away.`
        : "Once your lyrics are synced, a lyric video is about three clicks away.") +
        p("Pick a style (Slideshow, Living Scenes, or Cinematic) and Syllary builds an AI scene for every line, with your words painted into the artwork. You can preview it cheaply before committing to the full thing.") +
        button(target, title ? "Make the video" : "Start with a song") +
        muted("1080p MP4, ready for YouTube."),
      { unsubscribeUrl: unsubscribeUrl(userId) },
    ),
  };
}

/** Day-5 nudge: still on the free plan. */
export function buildDripUpgrade(userId: string) {
  return {
    subject: "Hey, your music is outgrowing the free plan",
    html: layout(
      p("Hey! Quick one from Syllary. We noticed you've actually been <em>using</em> the thing, which is the best compliment we get.") +
        p("Free tokens are a welcome gift, not a lifestyle. If there's more music coming (and there's always more music coming), plans start at <strong>$6 a month</strong>. That's a fresh stack of tokens every month, roughly ten songs of synced lyrics. The bigger plans go full music-video mode, watermark-free downloads included.") +
        p("Everything shares one wallet: lyrics, videos, covers. No fine print lurking anywhere.") +
        button(`${env.APP_URL}/upgrade`, "Find your plan") +
        muted("Cancel anytime. First payment refundable for 14 days. We're chill like that."),
      { unsubscribeUrl: unsubscribeUrl(userId) },
    ),
  };
}

/** Win-back: had real activity, then went quiet for ~a month. Names their last
 *  song so the email feels personal, and reminds them their library is intact. */
export function buildWinback(userId: string, lastSongTitle: string | null, songCount: number) {
  return {
    subject: lastSongTitle ? `“${lastSongTitle}” misses you (it told us)` : "Your songs miss you (they told us)",
    html: layout(
      p(lastSongTitle
        ? `Hey, it's been a minute! Your ${songCount > 1 ? `${songCount} songs are` : "song is"} still synced and safe in your library. <strong>${lastSongTitle}</strong> asks about you sometimes. We tell it you're busy. It doesn't believe us.`
        : "Hey, it's been a minute! Your library is right where you left it, synced and a little lonely.") +
        p("Meanwhile we haven't been sitting still. There are three lyric-video styles now (Slideshow, Living Scenes, and Cinematic, which is exactly as dramatic as it sounds), plus AI cover art and public song pages you can share anywhere.") +
        button(`${env.APP_URL}/library`, "Go say hi to your songs") +
        muted("Got a new track in the works? Upload it. Synced lyrics in about a minute, same as always."),
      { unsubscribeUrl: unsubscribeUrl(userId) },
    ),
  };
}

/** One-off re-engagement (Jun 2026): we shipped a fix making video previews a
 *  cheap flat price, so a free account can finally preview its song. Targets the
 *  users who hit the old (broken) high preview price. Marketing → respects
 *  emailOptOut + carries an unsubscribe link. */
export function buildPreviewFixEmail(opts: {
  userId: string;
  firstName?: string | null;
  ctaUrl?: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  const cta = opts.ctaUrl ?? `${env.APP_URL}/recent`;
  return {
    subject: "We messed up — your free video preview is unlocked",
    html: layout(
      p(greeting) +
        p("When you signed up and uploaded your track, you should've been able to preview it as a lyric video on your free account. You couldn't — and that was on us.") +
        p("A bug set the price of a video preview way too high, so your free credits didn't cover it. We just fixed it. A preview is now a small, flat price your free account easily covers — so you can watch your song come to life as a lyric video, on the house.") +
        button(cta, "Generate my free preview →") +
        p("Thanks for taking a chance on us early. We'd genuinely love to see what you make."),
      { unsubscribeUrl: unsubscribeUrl(opts.userId) },
    ),
  };
}

/** One-off apology (Jul 2026): the first reel subscriber hit the full-video
 *  paywall right after paying — the plan's token grant didn't cover the render.
 *  Sent after a manual token top-up. Transactional (service notice), so no
 *  unsubscribe link needed. */
export function buildTokenFixEmail(opts: {
  firstName?: string | null;
  ctaUrl: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return {
    subject: "Welcome to the Syllary family — and a token bug, fixed",
    html: layout(
      p(greeting) +
        p("Thank you for subscribing — we're genuinely happy to have you in the Syllary family.") +
        p(
          "Now, an apology. Right after you upgraded, you clicked “Create full video” and kept hitting a paywall. That was a bug on our side with how tokens were counted — not something you did. It's fixed, and we've topped up your account to make up for it: <strong>you now have enough tokens for roughly 5–10 full lyric videos.</strong> Your song is sitting right where you left it, one click away from the full 1080p render.",
        ) +
        button(opts.ctaUrl, "Finish your full video →") +
        p(
          `One more thing, and this one matters to me personally. I'm Anton, the founder — <strong><a href="mailto:anton@syllary.com" style="color:${BRAND.red};">anton@syllary.com</a></strong> is my direct email. If anything breaks, behaves in a way you didn't expect, or there's a missing feature that would help your music, write me. I read everything and I'll usually have a fix or the feature shipped very fast.`,
        ) +
        p("Make something great,<br/>Anton · Syllary"),
    ),
  };
}

/** Apology for the Jul 12-13 2026 processing outage (Replicate credit ran out;
 *  every song upload failed for ~44h). Sent to affected signed-in users after
 *  a +10,000-credit make-good was applied to their account. */
export function buildOutageApologyEmail(opts: {
  firstName?: string | null;
  ctaUrl: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return {
    subject: "Sorry about yesterday — it's fixed, and 10,000 credits are on us",
    html: layout(
      p(greeting) +
        p(
          "Yesterday we had an outage: songs uploaded to Syllary failed to process, and yours was one of them. Sorry about that — that's not the first impression we want to make.",
        ) +
        p(
          "We've been working hard on it and everything is live again. As a way to apologize, <strong>we've added 10,000 free credits to your account.</strong> Enjoy.",
        ) +
        p("Your song didn't make it through during the outage, so give it one more try — it'll work this time.") +
        button(opts.ctaUrl, "Upload your song again →") +
        p(
          `I'm Anton, the founder — <strong><a href="mailto:anton@syllary.com" style="color:${BRAND.red};">anton@syllary.com</a></strong> is my direct email. If anything else breaks or behaves oddly, write me. I read everything.`,
        ) +
        p("Make something great,<br/>Anton · Syllary"),
    ),
  };
}

/** Personal founder note to a user whose subscription checkout failed at the
 *  payment step (typo'd card, BNPL decline, ...). One-off sends, deduped via
 *  email_log — see scripts/send-checkout-recovery.ts. */
export function buildCheckoutRecoveryEmail(opts: {
  firstName?: string | null;
  ctaUrl: string;
  /** One sentence naming what happened to THEIR payment, e.g. "your Premiere
   *  checkout on July 8 didn't complete — the bank flagged a mistyped card
   *  number". Factual, blame-free, and always paired with "nothing was charged". */
  whatHappened: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return {
    subject: "Your Syllary checkout didn't go through — nothing was charged",
    html: layout(
      p(greeting) +
        p(
          `I'm Anton, the founder of Syllary. I saw that ${opts.whatHappened} — and to be clear, <strong>nothing was charged.</strong>`,
        ) +
        p(
          "Your song is still in your account, one step from the full video. Checkout takes a minute — and Apple Pay / Google Pay work too, no card-typing required. Every first subscription also comes with a <strong>one-time token bonus</strong> (+100,000 on the video plans — roughly a first month of ≈ 11 full videos on Reel).",
        ) +
        button(opts.ctaUrl, "Pick up where you left off →") +
        p(
          `And if something else got in the way — the price, a bug, anything — just reply. <strong><a href="mailto:anton@syllary.com" style="color:${BRAND.red};">anton@syllary.com</a></strong> is my direct email and I read everything.`,
        ) +
        p("Make something great,<br/>Anton · Syllary"),
    ),
  };
}

/** "You said you'd need to see it first — here it is": a comped full video,
 *  rendered founder-side for a skeptical free user. One-off sends. */
export function buildCompVideoEmail(opts: {
  firstName?: string | null;
  songTitle: string;
  ctaUrl: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return {
    subject: `Fair enough — I rendered "${opts.songTitle}" in full. On us.`,
    html: layout(
      p(greeting) +
        p(
          `Anton here, the founder of Syllary. You said you'd need to see what it looks like before you pay — that's fair. So I did something about it.`,
        ) +
        p(
          `First: <strong>${opts.songTitle} is a genuinely good track.</strong> And it made one hell of a video — golden-hour western scenes, your words living inside the frames, the full three minutes, synced to your audio. I rendered the whole thing for you, no charge:`,
        ) +
        button(opts.ctaUrl, "Watch your full video →") +
        p(
          "If it's what you wanted, a plan gets you the clean download and your next videos. If it's <em>not</em> what you wanted, reply and tell me what's off — I read everything, and blunt feedback is the most useful kind.",
        ) +
        p("Make something great,<br/>Anton · Syllary"),
    ),
  };
}

/** The comp full-video claim ("gift") email: sent ~3h after a preview-watcher
 *  goes idle without buying. The claim link opens their song in the editor with
 *  the first full render comped. Honest urgency: the link really expires. */
export function buildCompClaimEmail(opts: {
  firstName?: string | null;
  songTitle: string;
  claimUrl: string;
}): { subject: string; html: string } {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi there,";
  return {
    subject: `A gift, 24 hours only: your full "${opts.songTitle}" video — on us`,
    html: layout(
      p(greeting) +
        p(
          `You made a preview of <strong>${opts.songTitle}</strong> earlier — the words in the scene, synced to your track. A preview is a taste. Here's the whole meal, on us:`,
        ) +
        p(
          `The link below opens your song in the studio. Shape the scenes if you want — or just hit <strong>Generate video</strong> and get the full thing, every line, start to finish. <strong>Your first full render is free.</strong> No card, no tokens.`,
        ) +
        button(opts.claimUrl, "Claim your free full video →") +
        p(
          `One honest catch: this link expires in <strong>24 hours</strong>, and it's a one-time gift per account. After that, full renders are back to normal pricing.`,
        ) +
        p("Make something great,<br/>Anton · Syllary"),
    ),
  };
}

/** Look up the freshest user row for email decisions. */
export async function userForEmail(userId: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}
