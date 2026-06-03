import { useNavigate, useSearchParams } from "react-router-dom";
import { useAccount } from "@/lib/account-context";
import { UploadCard } from "@/components/landing/upload-card";

export function UploadPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { account, refresh } = useAccount();

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[24px] font-medium tracking-[-0.6px]">Upload a song</h1>
        {account && (
          <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/60">
            {account.credits.toLocaleString()} tokens left
          </span>
        )}
      </div>
      <UploadCard
        mode="credits"
        credits={account?.credits ?? null}
        prefillArtist={params.get("artist")}
        prefillAlbum={params.get("album")}
        prefillTitle={params.get("title")}
        onStarted={() => {
          refresh();
          navigate("/recent");
        }}
      />
    </div>
  );
}
