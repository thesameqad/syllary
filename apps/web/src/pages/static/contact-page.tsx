import { useState, type FormEvent } from "react";
import { Loader2, Mail, Send } from "lucide-react";
import { StaticPage } from "./static-page";
import { API_BASE } from "@/lib/api";

const TOPICS = ["Question", "Bug report", "Billing / refund", "Feature request", "Other"] as const;

export function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("Question");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim() || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), topic, message: message.trim() }),
      });
      setState(res.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  const inputCls =
    "w-full rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-pulse/60";

  return (
    <StaticPage
      title="Contact us"
      description="Get in touch with the Syllary team — questions, bugs, billing, anything."
    >
      <p>
        Send us a message and we&apos;ll reply to your email — usually within a day. Billing
        questions: include the email you subscribed with.
      </p>

      {state === "sent" ? (
        <div className="mt-8 rounded-[14px] border-[0.5px] border-success/30 bg-success/[0.08] p-6 text-[15px] text-white">
          Message sent — thank you! We&apos;ll get back to you at{" "}
          <span className="font-medium">{email}</span> shortly.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name (optional)"
              className={inputCls}
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputCls}
            />
          </div>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value as (typeof TOPICS)[number])}
            className={`${inputCls} appearance-none`}
          >
            {TOPICS.map((t) => (
              <option key={t} value={t} className="bg-stage text-white">
                {t}
              </option>
            ))}
          </select>
          <textarea
            required
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="How can we help?"
            rows={6}
            className={`${inputCls} resize-y`}
          />
          {state === "error" && (
            <p className="text-[13px] text-pulse">
              Couldn&apos;t send right now — please email us directly at{" "}
              <a href="mailto:hello@syllary.com">hello@syllary.com</a>.
            </p>
          )}
          <button
            type="submit"
            disabled={state === "sending"}
            className="inline-flex items-center gap-2 rounded-[10px] bg-pulse px-5 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send message
          </button>
        </form>
      )}

      <p className="mt-10 flex items-center gap-2 text-[13px] text-white/40">
        <Mail className="h-3.5 w-3.5" />
        Prefer email? <a href="mailto:hello@syllary.com">hello@syllary.com</a>
      </p>
    </StaticPage>
  );
}
