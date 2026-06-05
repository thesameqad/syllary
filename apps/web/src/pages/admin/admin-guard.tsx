import { useAccount } from "@/lib/account-context";

/** Client-side admin gate. The API enforces the ADMIN_CLERK_IDS allowlist on
 *  every admin route independently; this just hides the UI from non-admins. */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { account } = useAccount();
  if (!account) {
    return <p className="text-[14px] text-white/55">Loading…</p>;
  }
  if (!account.isAdmin) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-[20px] font-medium text-white">Not authorized</h1>
        <p className="mt-2 text-[14px] text-white/55">This area is for Syllary admins only.</p>
      </div>
    );
  }
  return <>{children}</>;
}
