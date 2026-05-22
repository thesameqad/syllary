import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { PLAN_CREDITS } from "@syllary/shared";
import { useAccount } from "@/lib/account-context";
import { PLAN_LABEL } from "@/lib/plans";

export function UserCard() {
  const { user } = useUser();
  const navigate = useNavigate();
  const { account } = useAccount();

  const plan = account?.plan ?? "free";
  const left = account?.credits ?? 0;
  const total = PLAN_CREDITS[plan];
  const pct = Math.max(0, Math.min(100, Math.round((left / total) * 100)));

  return (
    <div className="mt-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="flex items-center gap-2.5">
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-full bg-pulse/30" />
        )}
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-white">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "You"}
          </div>
          <div className="text-[11px] text-white/45">{PLAN_LABEL[plan]} plan</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-white/45">
          <span>Tokens</span>
          <span>
            {left.toLocaleString()} / {total.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-pulse" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {plan !== "pro" && (
        <button
          type="button"
          onClick={() => navigate("/upgrade")}
          className="mt-3 w-full rounded-full bg-pulse py-1.5 text-[12px] font-medium text-white transition-transform hover:scale-[1.02]"
        >
          Upgrade
        </button>
      )}
    </div>
  );
}
