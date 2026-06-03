import { Disc3 } from "lucide-react";
import type { AlbumGroup } from "@/lib/library";

/** A clickable album tile for the Library Albums tab / artist view. Opens the
 *  album's songs. `showArtist` is hidden when already inside an artist view. */
export function AlbumCard({
  group,
  onOpen,
  showArtist = true,
}: {
  group: AlbumGroup;
  onOpen: () => void;
  showArtist?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-[14px] border border-white/[0.07] bg-stage/50 text-left transition-colors hover:border-white/15"
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[linear-gradient(135deg,#1a1a1a,#0a0a0a)]">
        {group.cover ? (
          <img src={group.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-8 w-8 text-white/25" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-[13px] font-medium text-white">{group.album}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/40">
          {showArtist ? `${group.artist} · ` : ""}
          {group.songCount} {group.songCount === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}
