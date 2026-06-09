import type { VideoModel } from "@syllary/shared";

/** A short, real example clip per video format (≈10s, muted, looping) so people
 *  see the actual motion difference between Slideshow / Living Scenes / Cinematic
 *  rather than reading about it. Files live in web/public/format-previews/. These
 *  are fixed examples — they don't reflect the user's chosen look. */
export function VideoFormatPreview({ model }: { model: VideoModel }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-[9px] border border-white/10 bg-black">
      <video
        src={`/format-previews/${model}.mp4`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
