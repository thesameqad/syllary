import { cn } from "@/lib/utils";

export const LIBRARY_TABS = ["artists", "albums", "songs", "videos"] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];

const LABEL: Record<LibraryTab, string> = {
  artists: "Artists",
  albums: "Albums",
  songs: "Songs",
  videos: "Music Videos",
};

/** Four-tab bar for the Library. Selecting a tab clears any drill-down. */
export function LibraryTabs({
  active,
  onSelect,
}: {
  active: LibraryTab;
  onSelect: (tab: LibraryTab) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-[#0a0a0a] p-0.5 text-[13px]">
      {LIBRARY_TABS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onSelect(t)}
          className={cn(
            "rounded-full px-4 py-1.5 transition-colors",
            active === t ? "bg-white text-[#0a0a0a]" : "text-white/55 hover:text-white",
          )}
        >
          {LABEL[t]}
        </button>
      ))}
    </div>
  );
}
