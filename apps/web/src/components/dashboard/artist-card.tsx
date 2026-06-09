import { User } from "lucide-react";
import { EntityCardMenu, type EntityCardManage } from "@/components/dashboard/entity-card-menu";

/** A clickable artist tile for the Library Artists tab. With `manage` it grows a
 *  3-dots menu (edit cover/name + delete) like the song card. */
export function ArtistCard({
  name,
  subtitle,
  cover,
  onOpen,
  manage,
}: {
  name: string;
  subtitle: string;
  cover: string | null;
  onOpen: () => void;
  manage?: EntityCardManage;
}) {
  return (
    <div className="relative">
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
              <User className="h-8 w-8 text-white/25" />
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-[13px] font-medium text-white">{name}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/40">{subtitle}</div>
        </div>
      </button>
      {manage && (
        <EntityCardMenu
          label="Artist actions"
          onEdit={manage.onEdit}
          onDelete={manage.onDelete}
          deleteTitle="Delete artist"
          deleteWarning={
            <>
              Delete <span className="font-medium text-white">{name}</span>? This permanently
              deletes the artist,{" "}
              <span className="font-medium text-white">all their albums, and every song</span> — the
              lyrics, audio, and any generated videos. This can&apos;t be undone.
            </>
          }
        />
      )}
    </div>
  );
}
