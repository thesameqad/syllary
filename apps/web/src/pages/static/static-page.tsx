import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogoWordmark } from "@/components/logo";
import { Footer } from "@/components/landing/footer";
import { useSeo } from "@/lib/seo";

/** Shared shell for legal/info pages (terms, privacy, refunds, FAQ, contact):
 *  a quiet typographic page on the site's dark theme. */
export function StaticPage({
  title,
  description,
  updated,
  children,
  jsonLd,
}: {
  title: string;
  description: string;
  updated?: string;
  children: ReactNode;
  jsonLd?: Record<string, unknown>;
}) {
  useSeo({ title: `${title} — Syllary`, description, jsonLd });

  return (
    <main className="flex min-h-screen flex-col bg-void text-white">
      <header className="border-b border-white/[0.06] px-6 py-4 sm:px-8">
        <Link to="/" className="inline-flex items-center" aria-label="Syllary home">
          <LogoWordmark className="h-5" />
        </Link>
      </header>

      <div className="mx-auto w-full max-w-[720px] flex-1 px-6 py-14 sm:px-8">
        <h1 className="mb-2 text-[clamp(1.8rem,4vw,34px)] font-medium tracking-[-1.2px]">{title}</h1>
        {updated && <p className="mb-10 text-[13px] text-white/35">Last updated: {updated}</p>}
        <div className="static-prose space-y-4 text-[15px] leading-[1.75] text-white/70 [&_a]:text-pulse [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:text-[19px] [&_h2]:font-medium [&_h2]:tracking-[-0.4px] [&_h2]:text-white [&_h3]:mt-6 [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:text-white/90 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white/90">
          {children}
        </div>
      </div>

      <Footer />
    </main>
  );
}
