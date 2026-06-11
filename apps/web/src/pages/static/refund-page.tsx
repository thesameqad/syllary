import { Link } from "react-router-dom";
import { StaticPage } from "./static-page";

export function RefundPage() {
  return (
    <StaticPage
      title="Refund & Cancellation Policy"
      description="How cancellations, refunds, and token charges work at Syllary."
      updated="June 11, 2026"
    >
      <h2>Cancelling</h2>
      <p>
        You can cancel your subscription at any time from your account&apos;s billing portal — no
        email required. Your plan stays active until the end of the period you already paid for,
        and you keep any tokens granted for that period until it ends. We don&apos;t charge
        cancellation fees.
      </p>

      <h2>Refunds</h2>
      <ul>
        <li>
          <strong>First subscription, 14-day window:</strong> if Syllary isn&apos;t what you
          expected, email us within 14 days of your first payment and we&apos;ll refund it in
          full, provided you haven&apos;t consumed a substantial part of the plan&apos;s tokens
          (we apply this generously — trying the product properly is fine).
        </li>
        <li>
          <strong>Renewals:</strong> renewal payments are refundable within 7 days if no tokens
          from the new period were used.
        </li>
        <li>
          <strong>Failed generations:</strong> when a transcription or video render fails on our
          side, the tokens charged are refunded to your balance automatically — you don&apos;t
          need to ask.
        </li>
        <li>
          <strong>Consumed AI work:</strong> tokens spent on completed generations (lyric files
          delivered, videos rendered) are not refundable as money, because the underlying AI
          compute has already been paid for on our side.
        </li>
      </ul>

      <h2>How to request a refund</h2>
      <p>
        Email <a href="mailto:hello@syllary.com">hello@syllary.com</a> from your account email, or
        use the <Link to="/contact">contact form</Link>, with the subject &quot;Refund&quot;.
        We respond within 2 business days and process approved refunds back to your original
        payment method (it may take 5–10 days to appear, depending on your bank).
      </p>

      <h2>Statutory rights</h2>
      <p>
        Nothing in this policy limits any non-waivable rights you have under the consumer
        protection laws of your country.
      </p>
    </StaticPage>
  );
}
