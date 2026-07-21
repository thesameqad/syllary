import { createHmac } from "node:crypto";
import { env } from "../env.js";

// The comp full-video claim ("gift" rescue flow): an HMAC-signed, expiring,
// once-per-user link that lets a preview-watcher open their song in the editor
// with the FIRST full render on the house. The signature is the auth — the
// link arrives by email, exactly like the unsubscribe links.

/** Signature for a claim link. `expiresEpochSec` is baked into the signed
 *  payload so the expiry can't be tampered with. */
export function compClaimToken(userId: string, songId: string, expiresEpochSec: number): string {
  return createHmac("sha256", env.IP_HASH_SALT)
    .update(`comp:${userId}:${songId}:${expiresEpochSec}`)
    .digest("hex")
    .slice(0, 32);
}

export function verifyCompClaim(
  userId: string,
  songId: string,
  expiresEpochSec: number,
  token: string,
): { ok: boolean; expired: boolean } {
  const expected = compClaimToken(userId, songId, expiresEpochSec);
  if (token !== expected) return { ok: false, expired: false };
  return { ok: true, expired: Date.now() / 1000 > expiresEpochSec };
}

/** Full claim URL (served by the API host — it redirects into the editor). */
export function compClaimUrl(
  apiBaseUrl: string,
  userId: string,
  songId: string,
  expiresEpochSec: number,
): string {
  const t = compClaimToken(userId, songId, expiresEpochSec);
  const base = apiBaseUrl.replace(/\/$/, "");
  // All API routes are registered under the /api prefix (see index.ts).
  return `${base}/api/claim/full-video?u=${userId}&s=${songId}&e=${expiresEpochSec}&t=${t}`;
}
