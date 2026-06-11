import { Link } from "react-router-dom";
import { StaticPage } from "./static-page";

export function TermsPage() {
  return (
    <StaticPage
      title="Terms of Service"
      description="The terms that govern your use of Syllary."
      updated="June 11, 2026"
    >
      <p>
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Syllary
        (&quot;Syllary&quot;, &quot;we&quot;, &quot;us&quot;), available at syllary.com. By creating an
        account or using the service you agree to these Terms. If you do not agree, do not use
        Syllary.
      </p>

      <h2>1. What Syllary does</h2>
      <p>
        Syllary converts audio you upload into synchronized lyric files (formats such as LRC,
        enhanced LRC, TTML, SRT, VTT, TXT and JSON) and can generate lyric videos from your track
        using AI models. Outputs are generated automatically; transcription and synchronization are
        statistical processes and we do not guarantee they are error-free. You can review and edit
        results before exporting.
      </p>

      <h2>2. Your account</h2>
      <p>
        You must provide accurate information when creating an account and keep your credentials
        secure. You are responsible for activity under your account. You must be at least 16 years
        old (or the minimum age of digital consent in your country) to use Syllary.
      </p>

      <h2>3. Your content and rights</h2>
      <ul>
        <li>
          <strong>You keep your rights.</strong> Audio you upload, lyrics derived from it, and
          videos generated from it remain yours. We claim no ownership over your music or outputs.
        </li>
        <li>
          <strong>You must hold the rights.</strong> Only upload audio you own or are licensed to
          process. Do not upload other artists&apos; commercial recordings. You are solely
          responsible for ensuring your use of outputs (e.g. publishing a lyric video) complies
          with the rights attached to the underlying music, including the terms of AI music
          platforms you may have used to create it.
        </li>
        <li>
          <strong>License to operate.</strong> You grant us the limited license to host, process,
          and display your content solely to provide the service (e.g. sending audio to our
          transcription and image/video model providers, storing files, rendering your public page
          if you choose to publish one).
        </li>
        <li>
          <strong>Public pages and sharing.</strong> Content is private by default. If you mark a
          song public or share a link, the content on that page becomes visible to anyone with the
          URL and may be indexed by search engines.
        </li>
      </ul>

      <h2>4. Tokens, plans and billing</h2>
      <ul>
        <li>
          Paid features are metered in <strong>tokens</strong>. Processing costs scale with audio
          duration and the options you select; the price in tokens is shown before you confirm an
          operation.
        </li>
        <li>
          Subscriptions renew automatically each billing period until cancelled. You can cancel
          any time from your account&apos;s billing portal; access continues until the end of the
          paid period.
        </li>
        <li>
          Monthly token grants refresh each billing period and do not roll over unless stated
          otherwise. Tokens have no cash value and cannot be transferred.
        </li>
        <li>
          If a generation fails on our side, the tokens charged for it are automatically refunded
          to your balance. See our <Link to="/refunds">Refund Policy</Link> for money refunds.
        </li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>upload content you have no right to process, or content that is unlawful, hateful, or sexually exploitative of minors;</li>
        <li>attempt to bypass usage limits, token metering, or access controls;</li>
        <li>reverse engineer, scrape, or resell the service without our written consent;</li>
        <li>use outputs to mislead (e.g. presenting AI-generated content as a specific real artist&apos;s work without disclosure where required).</li>
      </ul>

      <h2>6. AI-generated content</h2>
      <p>
        Lyric videos and artwork are produced by third-party AI models. Outputs may occasionally be
        inaccurate, unexpected, or rejected by a model&apos;s safety systems. Where a generation is
        blocked by a provider, we surface the error and refund the tokens charged. You are
        responsible for reviewing outputs before publishing them and for complying with any
        disclosure obligations on platforms where you post them.
      </p>

      <h2>7. Availability and changes</h2>
      <p>
        We aim for high availability but the service is provided <strong>&quot;as is&quot;</strong>{" "}
        without warranties of any kind. We may modify, suspend, or discontinue features; if we
        discontinue the service entirely we will give reasonable notice and you will be able to
        export your files.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, Syllary will not be liable for indirect,
        incidental, special, consequential, or punitive damages, or lost profits or data. Our total
        liability for any claim is limited to the amount you paid us in the 12 months before the
        claim arose.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may delete your account at any time. We may suspend or terminate accounts that violate
        these Terms. On termination your stored content is deleted within a reasonable period,
        except where retention is required by law.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms. Material changes will be announced on the site or by email at
        least 14 days before they take effect. Continuing to use Syllary after changes take effect
        means you accept them.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms: <a href="mailto:hello@syllary.com">hello@syllary.com</a> or
        the <Link to="/contact">contact form</Link>.
      </p>
    </StaticPage>
  );
}
