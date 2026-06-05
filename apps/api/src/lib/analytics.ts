import { and, asc, eq, gte, sql } from "drizzle-orm";
import type { Lyrics } from "@syllary/shared";
import { db } from "../db/client.js";
import { analyticsEvents } from "../db/schema.js";

export type AnalyticsStage = "visited" | "generated" | "signed_up" | "subscribed" | "renewed";

type EventOpts = {
  ownerHash: string;
  userId?: string | null;
  props?: Record<string, unknown>;
};

/** Record a funnel event. Best-effort: analytics must never break a request, so
 *  all errors are swallowed. */
export async function recordEvent(stage: AnalyticsStage, opts: EventOpts): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      stage,
      ownerHash: opts.ownerHash,
      userId: opts.userId ?? null,
      props: opts.props ?? null,
    });
  } catch {
    // ignore
  }
}

type VisitOpts = { userId?: string | null; landingSlug?: string | null; referrer?: string | null };

/** Record a site visit. Deduped to one per identity (ownerHash) per UTC day so
 *  repeat page-loads don't bloat the table — EXCEPT we always capture the first
 *  visit that carries a landing slug (first-touch attribution), so a later
 *  landing arrival isn't swallowed by an earlier plain page-load that day. */
export async function recordVisit(ownerHash: string, opts: VisitOpts = {}): Promise<void> {
  try {
    const landingSlug = opts.landingSlug ?? null;
    const props =
      landingSlug || opts.referrer
        ? { ...(landingSlug ? { landingSlug } : {}), ...(opts.referrer ? { referrer: opts.referrer } : {}) }
        : null;

    if (landingSlug) {
      // First-touch: only record a landing visit if this identity has no prior
      // landing-attributed visit yet.
      const prior = await firstTouchLandingSlug(ownerHash);
      if (prior) return;
      await db
        .insert(analyticsEvents)
        .values({ stage: "visited", ownerHash, userId: opts.userId ?? null, props });
      return;
    }

    // Non-landing visit: keep the cheap one-per-day dedup.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recent] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.stage, "visited"),
          eq(analyticsEvents.ownerHash, ownerHash),
          gte(analyticsEvents.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return;
    await db
      .insert(analyticsEvents)
      .values({ stage: "visited", ownerHash, userId: opts.userId ?? null });
  } catch {
    // ignore
  }
}

/** The landing slug of an identity's earliest landing-attributed visit, or null.
 *  Drives first-touch attribution onto songs (at generation) and users (at the
 *  first authed visit). Best-effort: never throws. */
export async function firstTouchLandingSlug(ownerHash: string): Promise<string | null> {
  try {
    const [row] = await db
      .select({ slug: sql<string | null>`${analyticsEvents.props}->>'landingSlug'` })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.stage, "visited"),
          eq(analyticsEvents.ownerHash, ownerHash),
          sql`${analyticsEvents.props}->>'landingSlug' is not null`,
        ),
      )
      .orderBy(asc(analyticsEvents.createdAt))
      .limit(1);
    return row?.slug ?? null;
  } catch {
    return null;
  }
}

// Rough cost model (USD). Replicate bills by compute time and OpenRouter by
// tokens, so these are deliberately approximate.
const GEMINI_BLENDED_USD_PER_1M = 0.2; // Gemini 2.5 Flash, blended in/out
const REPLICATE_BASE_USD = 0.004; // Demucs + WhisperX fixed overhead
const REPLICATE_USD_PER_MIN = 0.0045; // compute scales with audio length

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export type GenerationCost = {
  llmTokensApprox: number;
  llmCostUsd: number;
  replicateCostUsd: number;
  totalCostUsd: number;
};

/** Approximate what a generation cost: LLM tokens (structuring + summary) and
 *  Replicate compute (vocal isolation + transcription). */
export function estimateGenerationCost(
  durationSeconds: number | null,
  lyrics: Lyrics,
): GenerationCost {
  const chars = lyrics.lines.reduce((n, l) => n + l.text.length, 0);
  // structure call (prompt+completion) + summary call (prompt) ≈ 3× the text.
  const llmTokensApprox = Math.round((chars / 4) * 3) + 200;
  const llmCostUsd = round6((llmTokensApprox / 1e6) * GEMINI_BLENDED_USD_PER_1M);
  const minutes = (durationSeconds ?? 0) / 60;
  const replicateCostUsd = round6(REPLICATE_BASE_USD + minutes * REPLICATE_USD_PER_MIN);
  return {
    llmTokensApprox,
    llmCostUsd,
    replicateCostUsd,
    totalCostUsd: round6(llmCostUsd + replicateCostUsd),
  };
}
