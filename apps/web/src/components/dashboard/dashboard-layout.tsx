import { Library, LayoutDashboard, Upload } from "lucide-react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { SignedIn, SignedOut, UserButton } from "@clerk/clerk-react";
import { LogoWordmark } from "@/components/logo";
import { UserCard } from "@/components/dashboard/user-card";
import { AccountProvider } from "@/lib/account-context";
import { authConfigured } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload New Song", icon: Upload },
  { to: "/library", label: "Library", icon: Library },
];

function navClass({ isActive }: { isActive: boolean }) {
  return cn(
    "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
    isActive ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-void text-white">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0c0c] p-5 md:flex">
        <Link to="/" aria-label="Syllary home" className="mb-8 px-1">
          <LogoWordmark />
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className={navClass}>
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        {authConfigured && <UserCard />}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.06] px-6 py-3.5">
          <div className="flex items-center gap-1 overflow-x-auto md:hidden">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClass}>
                <item.icon className="h-4 w-4" />
              </NavLink>
            ))}
          </div>
          <div className="ml-auto">{authConfigured && <UserButton afterSignOutUrl="/" />}</div>
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
