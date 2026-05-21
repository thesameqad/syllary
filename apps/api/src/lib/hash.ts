import { createHash } from "node:crypto";
import { env } from "../env.js";

/** Anonymous identity = salted hash of IP + UA (CLAUDE.md rule #3, no cookies). */
export function ownerHash(ip: string, userAgent: string): string {
  return createHash("sha256")
    .update(`${ip}|${userAgent}|${env.IP_HASH_SALT}`)
    .digest("hex");
}
