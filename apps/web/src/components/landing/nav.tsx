import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { LogoWordmark } from "@/components/logo";
import { authConfigured } from "@/lib/auth";

const SECTION_LINKS = [
  { label: "How it works", href: "#preview" },
  { label: "Pricing", href: "#pricing" },
];

function ctaClass() {
  return "rounded-full bg-white px-[18px] py-[9px] text-[13px] font-medium text-[#0a0a0a] transition-transform hover:scale-[1.04]";
}

function AccountArea() {
  if (!authConfigured) {
    return (
      <>
        <a
          href="#upload"
          className="hidden text-[13px] text-white/50 transition-colors hover:text-white sm:inline"
        >
          Sign in
        </a>
        <a href="#upload" className={ctaClass()}>
          Start free
        </a>
      </>
    );
  }
  return (
    <>
      <SignedOut>
        <Link
          to="/sign-in"
          className="hidden text-[13px] text-white/50 transition-colors hover:text-white sm:inline"
        >
          Sign in
        </Link>
        <Link to="/sign-up" className={ctaClass()}>
          Start free
        </Link>
      </SignedOut>
      <SignedIn>
        <Link
          to="/dashboard"
          className="hidden text-[13px] text-white/50 transition-colors hover:text-white sm:inline"
        >
          Dashboard
        </Link>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}

export function Nav() {
  return (
    <motion.nav
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="sticky top-0 z-50 border-b border-white/[0.04] bg-black/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-[18px] sm:px-8">
        <a href="#top" aria-label="Syllary home">
          <LogoWordmark />
        </a>
        <div className="flex items-center gap-5 sm:gap-[26px]">
          <div className="hidden items-center gap-[26px] sm:flex">
            {SECTION_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-[13px] text-white/50 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
          <AccountArea />
        </div>
      </div>
    </motion.nav>
  );
}
