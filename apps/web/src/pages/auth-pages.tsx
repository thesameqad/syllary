import { SignIn, SignUp } from "@clerk/clerk-react";
import { Link } from "react-router-dom";
import { LogoWordmark } from "@/components/logo";
import { authConfigured } from "@/lib/auth";

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-void px-4 py-10">
      <div className="flex flex-col items-center gap-8">
        <Link to="/" aria-label="Syllary home">
          <LogoWordmark />
        </Link>
        {children}
      </div>
    </main>
  );
}

function NotConfigured() {
  return (
    <AuthShell>
      <p className="max-w-sm text-center text-[14px] text-white/60">
        Authentication isn&apos;t configured yet. Add{" "}
        <span className="font-mono text-white/80">VITE_CLERK_PUBLISHABLE_KEY</span> to your env.
      </p>
    </AuthShell>
  );
}

export function SignInPage() {
  if (!authConfigured) return <NotConfigured />;
  return (
    <AuthShell>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
    </AuthShell>
  );
}

export function SignUpPage() {
  if (!authConfigured) return <NotConfigured />;
  return (
    <AuthShell>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
    </AuthShell>
  );
}
