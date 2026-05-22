import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SongSummary } from "@syllary/shared";
import { listPublicSongs, listSongs } from "@/lib/api";
import { SongCard } from "@/components/dashboard/song-card";

function Section({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: SongSummary[] | null;
  emptyText: string;
}) {
  return (
    <section>
      <h2 className="mb-4 text-[15px] font-medium text-white">{title}</h2>
      {items === null ? (
        <p className="text-[13px] text-white/35">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-white/35">{emptyText}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      )}
    </section>
  );
}

export function DashboardPage() {
  const [mine, setMine] = useState<SongSummary[] | null>(null);
  const [popular, setPopular] = useState<SongSummary[] | null>(null);

  useEffect(() => {
    listSongs()
      .then((s) => setMine(s.slice(0, 10)))
      .catch(() => setMine([]));
    listPublicSongs()
      .then(setPopular)
      .catch(() => setPopular([]));
  }, []);

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] font-medium tracking-[-0.6px]">Dashboard</h1>
        <Link
          to="/upload"
          className="rounded-full bg-pulse px-4 py-2 text-[13px] font-medium text-white transition-transform hover:scale-[1.03]"
        >
          Upload new song
        </Link>
      </div>
      <Section title="Recently generated" items={mine} emptyText="You haven't created any lyrics yet — upload a song to get started." />
      <Section title="Popular public lyrics" items={popular} emptyText="No public lyrics yet." />
    </div>
  );
}
