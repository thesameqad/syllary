import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { StaticPage } from "./static-page";
import { API_BASE } from "@/lib/api";

/** Landing target for the unsubscribe link in lifecycle emails. Calls the API
 *  (which validates the HMAC token) and confirms — no sign-in required. */
export function UnsubscribePage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    const u = params.get("u");
    const t = params.get("t");
    if (!u || !t) {
      setState("error");
      return;
    }
    fetch(`${API_BASE}/api/email/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`)
      .then((res) => setState(res.ok ? "done" : "error"))
      .catch(() => setState("error"));
  }, [params]);

  return (
    <StaticPage title="Email preferences" description="Unsubscribe from Syllary emails.">
      {state === "working" && (
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-pulse" /> Updating your preferences…
        </p>
      )}
      {state === "done" && (
        <>
          <p>
            You&apos;re unsubscribed from tips and upgrade emails. We&apos;ll still send the
            essentials — like &quot;your song is ready&quot; and billing receipts.
          </p>
          <p>Changed your mind? Just reply to any of our emails and we&apos;ll switch it back on.</p>
        </>
      )}
      {state === "error" && (
        <p>
          That unsubscribe link doesn&apos;t look valid. Email{" "}
          <a href="mailto:hello@syllary.com">hello@syllary.com</a> and we&apos;ll sort it out by
          hand.
        </p>
      )}
    </StaticPage>
  );
}
