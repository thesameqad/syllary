import { Link } from "react-router-dom";
import { StaticPage } from "./static-page";

export function PrivacyPage() {
  return (
    <StaticPage
      title="Privacy Policy"
      description="What Syllary collects, why, and who processes it."
      updated="June 11, 2026"
    >
      <p>
        This policy explains what data Syllary (&quot;we&quot;) collects when you use syllary.com,
        why we collect it, and the services that process it on our behalf.
      </p>

      <h2>1. What we collect</h2>
      <h3>Account data</h3>
      <p>
        Email address and display name, handled by our authentication provider (Clerk). We never
        see or store your password.
      </p>
      <h3>Your content</h3>
      <p>
        Audio files you upload, the lyrics and metadata derived from them, artwork, and generated
        videos. Stored in our file storage (Cloudflare R2) and database. Private by default;
        visible to others only if you publish or share it.
      </p>
      <h3>Usage and device data</h3>
      <ul>
        <li>
          <strong>A pseudonymous device identifier</strong>: we compute a salted hash of your IP
          address and browser user-agent. We use it to enforce free-tier limits for visitors
          without accounts and to attribute which page first brought a visitor to us. We do not
          store your raw IP address with this identifier.
        </li>
        <li>
          <strong>Ad click identifiers</strong>: if you arrive from an ad, the click ID
          (e.g. <code>gclid</code>, <code>msclkid</code>) and UTM parameters from the URL, used to
          measure which ads lead to sign-ups and purchases.
        </li>
        <li>
          <strong>Product analytics</strong>: pages viewed and product actions (e.g. &quot;file
          downloaded&quot;), and session replays of in-app interactions with all text inputs
          masked, via PostHog.
        </li>
        <li>
          <strong>Error data</strong>: when something breaks, technical details of the error (via
          Sentry) so we can fix it.
        </li>
      </ul>
      <h3>Payment data</h3>
      <p>
        Payments are processed by Stripe. We store your plan, subscription status, and token
        balance — never your card number.
      </p>

      <h2>2. Why we process it</h2>
      <ul>
        <li>To provide the service: transcription, file generation, video rendering, storage.</li>
        <li>To enforce fair-use limits and prevent abuse.</li>
        <li>To improve the product: understanding where users get stuck.</li>
        <li>To measure marketing: knowing which page or ad brought paying customers.</li>
        <li>To communicate: transactional email (e.g. &quot;your song is ready&quot;, receipts) and, with your consent, product updates.</li>
      </ul>

      <h2>3. Who processes data for us</h2>
      <p>We share data only with the processors needed to run Syllary:</p>
      <ul>
        <li><strong>Clerk</strong> — authentication and account management</li>
        <li><strong>Stripe</strong> — payments, subscriptions, and tax</li>
        <li><strong>Cloudflare</strong> — file storage (R2), CDN and security</li>
        <li><strong>Supabase</strong> — database hosting (PostgreSQL)</li>
        <li><strong>Render</strong> — application hosting</li>
        <li><strong>Replicate, fal.ai and OpenRouter</strong> — AI processing of your audio (vocal isolation, transcription) and generation of artwork/video. Your audio is sent to these providers solely to produce your outputs.</li>
        <li><strong>PostHog</strong> — product analytics and session replay</li>
        <li><strong>Sentry</strong> — error monitoring</li>
        <li><strong>Resend</strong> — email delivery</li>
        <li><strong>Google Ads & Microsoft Advertising</strong> — ad measurement (conversion tracking), where you arrived via an ad</li>
      </ul>

      <h2>4. Cookies and similar technologies</h2>
      <p>
        We use a small number of cookies and browser storage entries: authentication session
        (Clerk), analytics identifiers (PostHog), and ad measurement tags (Google, Microsoft) on
        marketing pages. We do not run third-party advertising networks on the product itself, and
        we do not sell personal data.
      </p>

      <h2>5. Retention</h2>
      <ul>
        <li>Your content: kept while your account exists; deleted within 30 days of account deletion.</li>
        <li>Analytics events: retained up to 24 months.</li>
        <li>Billing records: retained as required by tax and accounting law.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export, or delete
        your personal data, and to object to or restrict certain processing. Email{" "}
        <a href="mailto:hello@syllary.com">hello@syllary.com</a> and we will respond within 30
        days. You can delete individual songs at any time from your library, and your whole
        account from the account page or by contacting us.
      </p>

      <h2>7. International transfers</h2>
      <p>
        Our infrastructure is primarily hosted in the United States. Where data is transferred
        across borders, we rely on our processors&apos; standard contractual safeguards.
      </p>

      <h2>8. Changes</h2>
      <p>
        We will post any changes to this policy here and update the date above; material changes
        will be announced on the site or by email.
      </p>

      <h2>9. Contact</h2>
      <p>
        Privacy questions: <a href="mailto:hello@syllary.com">hello@syllary.com</a> or the{" "}
        <Link to="/contact">contact form</Link>.
      </p>
    </StaticPage>
  );
}
