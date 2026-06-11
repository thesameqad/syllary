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

/** Look up the freshest user row for email decisions. */
export async function userForEmail(userId: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return u ?? null;
}
