import { Disc3 } from "lucide-react";

/** A clickable album tile for the Library Albums tab / artist view. */
export function AlbumCard({
  title,
  subtitle,
  cover,
  onOpen,
}: {
  title: string;
  subtitle: string;
  cover: string | null;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full cursor-pointer overflow-hidden rounded-[14px] border border-white/[0.07] bg-stage/50 text-left transition-colors hover:border-white/15"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[linear-gradient(135deg,#1a1a1a,#0a0a0a)]">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-8 w-8 text-white/25" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-[13px] font-medium text-white">{title}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/40">{subtitle}</div>
      </div>
    </button>
  );
}
