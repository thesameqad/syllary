import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Loader2, ZoomIn } from "lucide-react";

const OUTPUT_SIZE = 1000; // square cover, px

/** Render the chosen crop area of an image to a square JPEG blob. */
async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image."));
    el.src = src;
  });
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not export image."))),
      "image/jpeg",
      0.9,
    );
  });
}

/** Facebook-style square crop: drag to reposition, slider to zoom. Calls
 *  onApply with a square JPEG blob. */
export function CoverCropper({
  src,
  busy,
  onApply,
  onCancel,
}: {
  src: string;
  busy: boolean;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [working, setWorking] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPx: Area) => {
    setAreaPixels(areaPx);
  }, []);

  async function apply() {
    if (!areaPixels) return;
    setWorking(true);
    try {
      const blob = await cropToBlob(src, areaPixels);
      onApply(blob);
    } finally {
      setWorking(false);
    }
  }

  const disabled = busy || working;

  return (
    <div>
      <div className="relative h-[320px] w-full overflow-hidden rounded-[12px] border border-white/10 bg-black">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ZoomIn className="h-4 w-4 shrink-0 text-white/50" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          disabled={disabled}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1 w-full cursor-pointer accent-pulse"
          aria-label="Zoom"
        />
      </div>
      <p className="mt-2 text-[11px] text-white/40">Drag to reposition · slide to zoom. Saved as a square cover.</p>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="rounded-full px-5 py-2.5 text-[14px] text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={disabled || !areaPixels}
          onClick={() => void apply()}
          className="inline-flex items-center gap-2 rounded-full bg-pulse px-6 py-2.5 text-[14px] font-medium text-white transition-transform hover:scale-[1.03] disabled:opacity-60"
        >
          {disabled && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Uploading…" : working ? "Cropping…" : "Apply"}
        </button>
      </div>
    </div>
  );
}
