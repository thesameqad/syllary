import { User } from "lucide-react";
import type { ArtistGroup } from "@/lib/library";

/** A clickable artist tile for the Library Artists tab. Opens the artist's albums. */
export function ArtistCard({ group, onOpen }: { group: ArtistGroup; onOpen: () => void }) {
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
            <User className="h-8 w-8 text-white/25" />
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-[13px] font-medium text-white">{group.name}</div>
        <div className="mt-0.5 truncate text-[11px] text-white/40">
          {group.albumCount} {group.albumCount === 1 ? "album" : "albums"} · {group.songCount}{" "}
          {group.songCount === 1 ? "song" : "songs"}
        </div>
      </div>
    </button>
  );
}
