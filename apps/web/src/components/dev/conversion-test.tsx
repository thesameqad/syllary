import { useState } from "react";
import { reportPurchaseConversion, reportSignupConversion } from "@/lib/ad-tags";

/** Manual conversion-tag tester. Renders ONLY when the URL carries `?ctest=1`,
 *  so ordinary visitors can never fire fake conversions (which would pollute
 *  Google Ads bidding). Lets us fire the `sign_up` and `purchase` gtag
 *  conversions on demand to confirm they reach Google.
 *
 *  How to use: open https://syllary.com/?ctest=1, then watch the events fire in
 *  Google Tag Assistant (tagassistant.google.com). For Google Ads to actually
 *  *attribute* the conversion, click one of your own ads first (in the same
 *  browser) so the gclid cookie is set, then come back to /?ctest=1 and fire. */
export function ConversionTestPanel() {
  const enabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("ctest");
  const [log, setLog] = useState<string[]>([]);
  if (!enabled) return null;

  const hasGtag = typeof window !== "undefined" && typeof window.gtag === "function";
  const note = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} — ${msg}`, ...l].slice(0, 6));

  return (
    <div className="fixed bottom-4 right-4 z-[9999] w-[268px] rounded-xl border border-white/15 bg-black/85 p-3 text-[12px] text-white shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-pulse">Conversion tag test</span>
        <span className={hasGtag ? "text-success" : "text-pulse"}>
          {hasGtag ? "gtag loaded" : "gtag MISSING"}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            reportSignupConversion();
            note("sign_up fired");
          }}
          className="rounded-md bg-white/10 px-3 py-2 text-left transition-colors hover:bg-white/20"
        >
          Fire <span className="font-mono">sign_up</span> conversion
        </button>
        <button
          type="button"
          onClick={() => {
            reportPurchaseConversion({ valueUsd: 14, transactionId: `test-${Date.now()}` });
            note("purchase fired ($14)");
          }}
          className="rounded-md bg-pulse/80 px-3 py-2 text-left transition-colors hover:bg-pulse"
        >
          Fire <span className="font-mono">purchase</span> conversion
        </button>
      </div>
      {log.length > 0 && (
        <div className="mt-2 space-y-0.5 text-[11px] text-white/55">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      <div className="mt-2 text-[10px] leading-snug text-white/35">
        Watch in Google Tag Assistant. Click your own ad first so the gclid cookie
        is set if you want Google Ads to attribute it.
      </div>
    </div>
  );
}
