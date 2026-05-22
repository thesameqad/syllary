import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { PublicSong } from "@syllary/shared";
import { getPublicSong } from "@/lib/api";
import { LyricsPlayer } from "@/components/result/lyrics-player";

/** Compact, embeddable player for iframes (referenced by the public page's
 *  Embed snippet). No app chrome; just the card + a subtle attribution. */
export function EmbedPage() {
  const { songId } = useParams<{ songId: string }>();
  const [song, setSong] = useState<PublicSong | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!songId) return;
    let active = true;
    getPublicSong(songId)
      .then((s) => active && setSong(s))
      .catch(() => active && setMissing(true));
    return () => {
      active = false;
    };
  }, [songId]);

  if (missing) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void p-4 text-[13px] text-white/50">
        This track isn’t available.
      </div>
    );
  }

  if (!song) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void">
        <Loader2 className="h-7 w-7 animate-spin text-pulse" />
      </div>
    );
  }

  const lyrics = song.lyrics ?? { language: null, lines: [] };

  return (
    <div className="min-h-dvh bg-void p-3 text-white">
      <LyricsPlayer
        audioUrl={song.audioUrl}
        lyrics={lyrics}
        title={song.title}
        meta={[song.artist, song.album].filter(Boolean).join(" · ")}
        coverUrl={song.coverUrl}
        baseName="lyrics"
        lyricsAlign="left"
      />
      <div className="mt-2 text-right text-[11px] text-white/30">
        <Link to={`/p/${song.id}`} target="_blank" className="hover:text-white/60">
          Powered by Syllary →
        </Link>
      </div>
    </div>
  );
}
