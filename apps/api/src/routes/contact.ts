import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { ownerHash } from "../lib/hash.js";

const contactSchema = z.object({
  name: z.string().max(200).optional().default(""),
  email: z.string().email().max(320),
  topic: z.string().max(100).optional().default("Question"),
  message: z.string().min(5).max(8000),
});

// Cheap in-memory rate limit: 5 messages/hour per device hash. Survives only
// for the process lifetime, which is plenty for a contact form.
const recent = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 5;

function allow(hash: string): boolean {
  const now = Date.now();
  const stamps = (recent.get(hash) ?? []).filter((t) => now - t < WINDOW_MS);
  if (stamps.length >= MAX_PER_WINDOW) return false;
  stamps.push(now);
  recent.set(hash, stamps);
  return true;
}

/** Contact form → founder inbox via Resend's REST API (plain fetch, no SDK).
 *  Without RESEND_API_KEY the message is logged instead — the form still
 *  acknowledges, and nothing is lost while credentials are pending. */
export async function contactRoutes(app: FastifyInstance) {
  app.post("/contact", async (req, reply) => {
    const parsed = contactSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid message." });
    const { name, email, topic, message } = parsed.data;

    const hash = ownerHash(req.ip, req.headers["user-agent"] ?? "");
    if (!allow(hash)) {
      return reply.code(429).send({ error: "Too many messages — please try again later." });
    }

    const subject = `[Syllary contact] ${topic}${name ? ` — ${name}` : ""}`;
    const body = `From: ${name || "(no name)"} <${email}>\nTopic: ${topic}\n\n${message}`;

    if (!env.RESEND_API_KEY) {
      req.log.warn({ subject, email, message }, "contact-form (Resend not configured)");
      return reply.send({ ok: true });
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [env.CONTACT_TO_EMAIL],
          reply_to: email,
          subject,
          text: body,
        }),
      });
      if (!res.ok) {
        // Delivery failed (e.g. domain not verified yet) — never lose the
        // lead: the full message lands in the error log (and Sentry) instead.
        req.log.error(
          { status: res.status, resendBody: await res.text(), subject, email, message },
          "contact-form resend failed — message preserved in log",
        );
      }
      return reply.send({ ok: true });
    } catch (err) {
      req.log.error({ err, subject, email, message }, "contact-form resend errored — message preserved in log");
      return reply.send({ ok: true });
    }
  });
}
