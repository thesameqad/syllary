import { useState, type FormEvent } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Loader2, Mail, Send } from "lucide-react";
import { StaticPage } from "./static-page";
import { DashboardChrome } from "@/components/dashboard/dashboard-layout";
import { API_BASE } from "@/lib/api";
import { authConfigured } from "@/lib/auth";

const TOPICS = ["Question", "Bug report", "Billing / refund", "Feature request", "Other"] as const;

function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>("Question");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !message.trim() || state === "sending") return;
    setState("sending");
    setErrorText(null);
    try {
      const res = await fetch(`${API_BASE}/api/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), topic, message: message.trim() }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setErrorText(data.error ?? null);
      setState("error");
    } catch {
      setState("error");
    }
  }

  const inputCls =
    "w-full rounded-[10px] border-[0.5px] border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none transition-colors focus:border-pulse/60";

  if (state === "sent") {
    return (
      <div className="mt-8 rounded-[14px] border-[0.5px] border-success/30 bg-success/[0.08] p-6 text-[15px] text-white">
        Message sent. Thank you! We&apos;ll get back to you at{" "}
        <span className="font-medium">{email}</span> shortly.
      </div>
    );
  }

  return (
    <>
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
          minLength={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          rows={6}
          className={`${inputCls} resize-y`}
        />
        {state === "error" && (
          <p className="text-[13px] text-pulse">
            {errorText ?? (
              <>
                Couldn&apos;t send right now. Please email us directly at{" "}
                <a href="mailto:hello@syllary.com" className="underline">hello@syllary.com</a>.
              </>
            )}
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

      <p className="mt-10 flex items-center gap-2 text-[13px] text-white/40">
        <Mail className="h-3.5 w-3.5" />
        Prefer email? <a href="mailto:hello@syllary.com" className="text-pulse">hello@syllary.com</a>
      </p>
    </>
  );
}

const INTRO =
  "Send us a message and we'll reply to your email, usually within a day. Billing questions: include the email you subscribed with.";

/** Signed-in users get the form inside the dashboard chrome (sidebar intact);
 *  visitors get the standalone marketing-style page. Same form either way. */
function SignedInAware() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) {
    return (
      <DashboardChrome>
        <div className="mx-auto max-w-[640px]">
          <h1 className="mb-2 text-[24px] font-medium tracking-[-0.8px] text-white">Support</h1>
          <p className="text-[14px] leading-[1.65] text-white/60">{INTRO}</p>
          <ContactForm />
        </div>
      </DashboardChrome>
    );
  }
  return (
    <StaticPage title="Contact us" description="Get in touch with the Syllary team.">
      <p>{INTRO}</p>
      <ContactForm />
    </StaticPage>
  );
}

export function ContactPage() {
  if (!authConfigured) {
    return (
      <StaticPage title="Contact us" description="Get in touch with the Syllary team.">
        <p>{INTRO}</p>
        <ContactForm />
      </StaticPage>
    );
  }
  return <SignedInAware />;
}
