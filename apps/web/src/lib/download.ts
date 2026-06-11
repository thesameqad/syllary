import { captureClient } from "./analytics";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, content: string, mime: string) {
  captureClient("format_downloaded", { format: filename.split(".").pop() ?? "unknown" });
  triggerDownload(new Blob([content], { type: `${mime};charset=utf-8` }), filename);
}

/** Bundle multiple generated files into a single .zip and download it. */
export async function downloadZip(
  zipName: string,
  files: { filename: string; content: string }[],
) {
  captureClient("format_downloaded", {
    format: "zip",
    formats: files.map((f) => f.filename.split(".").pop() ?? "unknown"),
  });
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const f of files) zip.file(f.filename, f.content);
  const blob = await zip.generateAsync({ type: "blob" });
  triggerDownload(blob, zipName);
}
