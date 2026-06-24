import { User } from "lucide-react";
import { EntityCardMenu, type EntityCardManage } from "@/components/dashboard/entity-card-menu";

/** A cast-member tile for the Library Cast tab: first photo (or a fallback
 *  icon), the cast member's name, their artist, and a 3-dots edit/delete menu. */
export function MemberCard({
  name,
  band,
  cover,
  imageCount,
  onEdit,
  manage,
}: {
  name: string;
  band: string;
  cover: string | null;
  imageCount: number;
  onEdit: () => void;
  manage: EntityCardManage;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onEdit}
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
          {imageCount > 1 && (
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white/85 backdrop-blur">
              {imageCount} photos
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-[13px] font-medium text-white">{name}</div>
          <div className="mt-0.5 truncate text-[11px] text-white/40">{band}</div>
        </div>
      </button>
      <EntityCardMenu
        label="Cast member actions"
        onEdit={onEdit}
        onDelete={manage.onDelete}
        deleteTitle="Delete cast member"
        deleteWarning={
          <>
            Delete <span className="font-medium text-white">{name}</span>? This removes the cast
            member and all their reference photos. Videos already generated with them are
            unaffected. This can&apos;t be undone.
          </>
        }
      />
    </div>
  );
}
