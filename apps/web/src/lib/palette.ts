/**
 * Extract a palette of vivid colors from an image (album art), used to paint a
 * generative aurora background.
 *
 * Uses `fetch` + `createImageBitmap` rather than an <img> element: drawing a
 * bitmap decoded from a blob we own never taints the canvas, so `getImageData`
 * works regardless of how the browser cached the cover for <img> display. R2
 * serves the cover with permissive CORS, so the fetch succeeds cross-origin.
 *
 * Best-effort: returns null on any failure so callers fall back to a default.
 */
export async function extractPalette(url: string): Promise<string[] | null> {
  try {
    // `cache: "reload"` bypasses any non-CORS copy the <img> tag cached for the
    // same URL — reusing that poisoned entry makes the browser reject the read.
    const res = await fetch(url, { mode: "cors", cache: "reload" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const size = 56;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, size, size);

    type Bucket = { r: number; g: number; b: number; count: number };
    const vivid = new Map<string, Bucket>();
    const all = new Map<string, Bucket>();
    let sampled = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const a = data[i + 3]!;
      if (a < 125) continue;
      sampled++;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

      // Fine quantization (16 levels/channel) keeps magenta distinct from red.
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const add = (map: Map<string, Bucket>) => {
        const cur = map.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
        cur.r += r;
        cur.g += g;
        cur.b += b;
        cur.count++;
        map.set(key, cur);
      };
      add(all);
      // Only colorful, non-extreme pixels feed the "vivid" set.
      if (sat >= 0.22 && lum >= 0.12 && lum <= 0.92) add(vivid);
    }

    const toColors = (map: Map<string, Bucket>) =>
      [...map.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 4)
        .map((c) => `rgb(${Math.round(c.r / c.count)}, ${Math.round(c.g / c.count)}, ${Math.round(c.b / c.count)})`);

    // Prefer vivid colors when the art has enough of them; else fall back to the
    // most common colors overall; else give up so the caller uses its default.
    let vividCount = 0;
    for (const b of vivid.values()) vividCount += b.count;
    if (vivid.size >= 2 && vividCount > sampled * 0.04) return toColors(vivid);

    const overall = toColors(all);
    return overall.length >= 2 ? overall : null;
  } catch {
    return null;
  }
}
