import { Clock, Coins, Library, LayoutDashboard, LifeBuoy, Megaphone, Upload } from "lucide-react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { LogoWordmark } from "@/components/logo";
import { UserCard } from "@/components/dashboard/user-card";
import { AccountProvider, useAccount } from "@/lib/account-context";
import { authConfigured } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload New Song", icon: Upload },
  { to: "/recent", label: "Recent", icon: Clock },
  { to: "/library", label: "Library", icon: Library },
];

const ADMIN_NAV = [{ to: "/admin/landing", label: "Landing pages", icon: Megaphone }];

function useNavItems() {
  const { account } = useAccount();
  return account?.isAdmin ? [...NAV, ...ADMIN_NAV] : NAV;
}

/** The token balance for mobile — the desktop sidebar's UserCard is hidden there,
 *  so without this there's nowhere to see tokens left on a phone. Taps through to
 *  the upgrade page. */
function MobileTokens() {
  const { account } = useAccount();
  if (!account) return null;
  return (
    <Link
      to="/upgrade"
      aria-label={`${account.credits.toLocaleString()} tokens left`}
      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-medium text-white/85 transition-colors hover:border-pulse/50 hover:text-white md:hidden"
    >
      <Coins className="h-3.5 w-3.5 text-pulse" />
      {account.credits.toLocaleString()}
    </Link>
  );
}

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
    isActive ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const navItems = useNavItems();
  return (
    <div className="flex h-dvh overflow-hidden bg-void text-white">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-5 md:flex">
        <Link to="/" aria-label="Syllary home" className="mb-8 px-1">
          <LogoWordmark />
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <NavLink to="/contact" className={cn(navClass({ isActive: false }), "mb-2")}>
            <LifeBuoy className="h-4 w-4" />
            Support
          </NavLink>
          {authConfigured && <UserCard />}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-6 py-3.5">
          <div className="flex items-center gap-1 overflow-x-auto md:hidden">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                <item.icon className="h-4 w-4" />
              </NavLink>
            ))}
            <NavLink to="/contact" className={navClass} aria-label="Support">
              <LifeBuoy className="h-4 w-4" />
            </NavLink>
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {authConfigured && <MobileTokens />}
            {authConfigured && <UserButton afterSignOutUrl="/" />}
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}

/** Dashboard chrome (sidebar + header) for pages outside the routed layout,
 *  e.g. the signed-in result page. Requires Clerk to be configured. */
export function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <AccountProvider>
      <Shell>{children}</Shell>
    </AccountProvider>
  );
}

export function DashboardLayout() {
  if (!authConfigured) {
    return (
      <Shell>
        <p className="text-[14px] text-white/60">Authentication isn&apos;t configured yet.</p>
      </Shell>
    );
  }
  return (
    <>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
      <SignedIn>
        <AccountProvider>
          <Shell>
            <Outlet />
          </Shell>
        </AccountProvider>
      </SignedIn>
    </>
  );
}
