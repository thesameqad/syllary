import {
  accountSchema,
  type Album,
  albumListSchema,
  type Artist,
  artistListSchema,
  type BandMember,
  bandMemberListSchema,
  bandMemberSchema,
  type CreateBandMember,
  type UpdateBandMember,
  type CreateElement,
  type UpdateElement,
  type SongElement,
  songElementSchema,
  songElementListSchema,
  type CatalogImportResult,
  catalogImportResultSchema,
  coverGenerateResponseSchema,
  coverPresignResponseSchema,
  type CoverGenerateResponse,
  type CoverModel,
  type DemoVideoRequest,
  type DemoVideoResult,
  demoVideoResultSchema,
  type CreateVideoRequest,
  type LinkMatch,
  linkMatchSchema,
  type MetaSuggestions,
  metaSuggestionsSchema,
  type SongInsights,
  songInsightsSchema,
  type ToolSectionsResponse,
  toolSectionsResponseSchema,
  type CreateLanding,
  type LandingAdmin,
  landingAdminSchema,
  type LandingFunnel,
  landingFunnelSchema,
  type LandingPage,
  landingPageSchema,
  type UpdateLanding,
  presignResponseSchema,
  publicSongSchema,
  ratingSummarySchema,
  songListSchema,
  songSchema,
  type Account,
  type BillingPeriod,
  type CheckoutRequest,
  type GenerationMode,
  type Lyrics,
  type PresignRequest,
  type PresignResponse,
  type PublicSong,
  type RatingSummary,
  type ReviewSegment,
  reviewSegmentSchema,
  type Song,
  type SongSummary,
  type UpdateAlbum,
  type UpdateArtist,
  type UpdateSong,
  type UpdateVideoJob,
  type VideoDownloadRequest,
  type VideoDownloadResponse,
  videoDownloadResponseSchema,
  type VideoJob,
  videoJobSchema,
  type VideoModel,
} from "@syllary/shared";

export const API_BASE =
  (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "") || "http://localhost:3000";

// Clerk's getToken is a React hook; a bridge component registers it here so the
// plain fetch helpers can attach the bearer token. Null when signed out.
let tokenGetter: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: (() => Promise<string | null>) | null) {
  tokenGetter = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (!tokenGetter) return {};
  const token = await tokenGetter();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "error" in data) {
    const { error } = data as { error?: unknown };
    if (typeof error === "string") return error;
  }
  return fallback;
}

export async function presignUpload(req: PresignRequest): Promise<PresignResponse> {
  const res = await fetch(`${API_BASE}/api/uploads/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(req),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start upload."), res.status);
  return presignResponseSchema.parse(data);
}

export function uploadToR2(
  url: string,
  body: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError("Upload to storage failed.", xhr.status));
    xhr.onerror = () => reject(new ApiError("Upload to storage failed.", 0));
    xhr.send(body);
  });
}

type UploadOptions = {
  title: string | null;
  artist?: string | null;
  album?: string | null;
  year?: number | null;
  durationSeconds: number | null;
  cover: { blob: Blob; contentType: string } | null;
  mode?: GenerationMode;
};

/** Full upload flow: presign → PUT audio (+ cover) → start processing. */
export async function uploadAndProcess(
  file: File,
  opts: UploadOptions,
  onProgress: (percent: number) => void,
): Promise<string> {
  const contentType = file.type || "application/octet-stream";
  const presign = await presignUpload({
    filename: file.name,
    contentType,
    size: file.size,
    durationSeconds: opts.durationSeconds,
    title: opts.title ?? undefined,
    artist: opts.artist ?? undefined,
    album: opts.album ?? undefined,
    year: opts.year ?? undefined,
    coverContentType: opts.cover?.contentType,
  });
  await uploadToR2(presign.uploadUrl, file, contentType, onProgress);
  if (opts.cover && presign.coverUploadUrl) {
    try {
      await uploadToR2(presign.coverUploadUrl, opts.cover.blob, opts.cover.contentType, () => {});
    } catch {
      // cover is best-effort
    }
  }
  await processSong(presign.songId, opts.mode);
  return presign.songId;
}

export async function processSong(id: string, mode?: GenerationMode): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(mode ? { mode } : {}),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not process track."), res.status);
  return songSchema.parse(data);
}

/** One-shot demo lyric video from the fixed sample clip — anonymous, no upload.
 *  The backend renders a ~10s Slideshow in the chosen style and returns a
 *  playable URL. Capped to one render per visitor (429 after that). */
export async function generateDemoVideo(req: DemoVideoRequest): Promise<DemoVideoResult> {
  const res = await fetch(`${API_BASE}/api/tools/demo-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't generate the demo video."), res.status);
  return demoVideoResultSchema.parse(data);
}

/** Re-run the pipeline for an already-uploaded song with a different mode.
 *  Reuses the R2 audio file (no upload), charges the new mode's token cost,
 *  and resets the row to "processing". */
export async function regenerateSong(id: string, mode: GenerationMode): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ mode }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not regenerate."), res.status);
  return songSchema.parse(data);
}

export async function getSong(id: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Song not found."), res.status);
  return songSchema.parse(data);
}

export async function getAccount(): Promise<Account> {
  const res = await fetch(`${API_BASE}/api/me`, { headers: { ...(await authHeaders()) } });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load account."), res.status);
  return accountSchema.parse(data);
}

function urlFrom(data: unknown): string {
  if (data && typeof data === "object" && "url" in data) {
    const { url } = data as { url?: unknown };
    if (typeof url === "string") return url;
  }
  throw new ApiError("Unexpected response.", 502);
}

export async function startCheckout(
  tier: CheckoutRequest["tier"],
  billingPeriod: BillingPeriod,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ tier, billingPeriod }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start checkout."), res.status);
  return urlFrom(data);
}

export async function listSongs(): Promise<SongSummary[]> {
  const res = await fetch(`${API_BASE}/api/songs`, { headers: { ...(await authHeaders()) } });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load your library."), res.status);
  return songListSchema.parse(data);
}

export async function listPublicSongs(): Promise<SongSummary[]> {
  const res = await fetch(`${API_BASE}/api/songs/public`);
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load songs."), res.status);
  return songListSchema.parse(data);
}

export async function updateSong(id: string, body: UpdateSong): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not update the song."), res.status);
  return songSchema.parse(data);
}

/** Replace a song's cover image: presign → direct PUT to R2 → commit. The
 *  blob is a square JPEG produced by the cropper. Returns the updated song. */
export async function uploadCover(songId: string, blob: Blob): Promise<Song> {
  const presignRes = await fetch(`${API_BASE}/api/songs/${songId}/cover/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ contentType: "image/jpeg" }),
  });
  const presignData: unknown = await presignRes.json();
  if (!presignRes.ok) {
    throw new ApiError(errorMessage(presignData, "Couldn't start the image upload."), presignRes.status);
  }
  const { uploadUrl, key } = coverPresignResponseSchema.parse(presignData);

  await uploadToR2(uploadUrl, blob, "image/jpeg", () => {});

  const res = await fetch(`${API_BASE}/api/songs/${songId}/cover`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return songSchema.parse(data);
}

/** AI-generate a cover image from a description with the chosen model. Returns
 *  an uncommitted preview (key + URL); call saveGeneratedCover(key) to attach it. */
export async function generateCover(
  songId: string,
  prompt: string,
  model: CoverModel,
): Promise<CoverGenerateResponse> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/cover/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ prompt, model }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't generate the cover."), res.status);
  return coverGenerateResponseSchema.parse(data);
}

/** Attach a previously-generated (or uploaded) cover key to the song. */
export async function saveGeneratedCover(songId: string, key: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/cover`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return songSchema.parse(data);
}

/** Auto-match a track's streaming links — from a pasted streaming URL, or from a
 *  title + artist search. */
export async function matchLinks(opts: {
  title?: string;
  artist?: string;
  url?: string;
}): Promise<LinkMatch> {
  const params = new URLSearchParams();
  if (opts.title?.trim()) params.set("title", opts.title.trim());
  if (opts.artist?.trim()) params.set("artist", opts.artist.trim());
  if (opts.url?.trim()) params.set("url", opts.url.trim());
  const res = await fetch(`${API_BASE}/api/links/match?${params.toString()}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't find links."), res.status);
  return linkMatchSchema.parse(data);
}

// ---- Artist / album entities (organized Library) ----

export async function listArtists(): Promise<Artist[]> {
  const res = await fetch(`${API_BASE}/api/artists`, { headers: { ...(await authHeaders()) } });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't load artists."), res.status);
  return artistListSchema.parse(data);
}

export async function listAlbums(): Promise<Album[]> {
  const res = await fetch(`${API_BASE}/api/albums`, { headers: { ...(await authHeaders()) } });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't load albums."), res.status);
  return albumListSchema.parse(data);
}

export async function updateArtist(id: string, body: UpdateArtist): Promise<void> {
  const res = await fetch(`${API_BASE}/api/artists/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't save the artist."), res.status);
  }
}

export async function updateAlbum(id: string, body: UpdateAlbum): Promise<void> {
  const res = await fetch(`${API_BASE}/api/albums/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't save the album."), res.status);
  }
}

export async function deleteArtist(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/artists/${id}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't delete the artist."), res.status);
  }
}

export async function deleteAlbum(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/albums/${id}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't delete the album."), res.status);
  }
}

function coverUrlFrom(data: unknown): string | null {
  if (data && typeof data === "object" && "coverUrl" in data) {
    const { coverUrl } = data as { coverUrl?: unknown };
    if (typeof coverUrl === "string") return coverUrl;
  }
  return null;
}

type EntityKind = "artists" | "albums";

/** Upload + commit a cover for an artist/album entity (square JPEG blob). */
export async function uploadEntityCover(
  kind: EntityKind,
  id: string,
  blob: Blob,
): Promise<string | null> {
  const presignRes = await fetch(`${API_BASE}/api/${kind}/${id}/cover/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ contentType: "image/jpeg" }),
  });
  const presignData: unknown = await presignRes.json();
  if (!presignRes.ok) {
    throw new ApiError(errorMessage(presignData, "Couldn't start the upload."), presignRes.status);
  }
  const { uploadUrl, key } = coverPresignResponseSchema.parse(presignData);
  await uploadToR2(uploadUrl, blob, "image/jpeg", () => {});
  const res = await fetch(`${API_BASE}/api/${kind}/${id}/cover`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return coverUrlFrom(data);
}

/** AI-generate a cover for an entity → uncommitted preview {key,url}. */
export async function generateEntityCover(
  kind: EntityKind,
  id: string,
  prompt: string,
  model: CoverModel,
): Promise<CoverGenerateResponse> {
  const res = await fetch(`${API_BASE}/api/${kind}/${id}/cover/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ prompt, model }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't generate the cover."), res.status);
  return coverGenerateResponseSchema.parse(data);
}

/** Commit a previously-generated entity cover key. Returns the new coverUrl. */
export async function saveEntityCover(
  kind: EntityKind,
  id: string,
  key: string,
): Promise<string | null> {
  const res = await fetch(`${API_BASE}/api/${kind}/${id}/cover`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return coverUrlFrom(data);
}

// ---- Band members (characters) ---------------------------------------------

export async function listMembers(): Promise<BandMember[]> {
  const res = await fetch(`${API_BASE}/api/members`, { headers: { ...(await authHeaders()) } });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't load members."), res.status);
  return bandMemberListSchema.parse(data);
}

export async function createMember(body: CreateBandMember): Promise<BandMember> {
  const res = await fetch(`${API_BASE}/api/members`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't create the member."), res.status);
  return bandMemberSchema.parse(data);
}

export async function updateMember(id: string, body: UpdateBandMember): Promise<BandMember> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the member."), res.status);
  return bandMemberSchema.parse(data);
}

export async function deleteMember(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/members/${id}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't delete the member."), res.status);
  }
}

/** Upload + commit one member photo; returns the updated member. */
export async function uploadMemberImage(id: string, blob: Blob): Promise<BandMember> {
  const presignRes = await fetch(`${API_BASE}/api/members/${id}/images/presign`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ contentType: "image/jpeg" }),
  });
  const presignData: unknown = await presignRes.json();
  if (!presignRes.ok) {
    throw new ApiError(errorMessage(presignData, "Couldn't start the upload."), presignRes.status);
  }
  const { uploadUrl, key } = coverPresignResponseSchema.parse(presignData);
  await uploadToR2(uploadUrl, blob, "image/jpeg", () => {});
  const res = await fetch(`${API_BASE}/api/members/${id}/images`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return bandMemberSchema.parse(data);
}

/** Remove one member photo by key; returns the updated member. */
export async function removeMemberImage(id: string, key: string): Promise<BandMember> {
  const res = await fetch(`${API_BASE}/api/members/${id}/images`, {
    method: "DELETE",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't remove the image."), res.status);
  return bandMemberSchema.parse(data);
}

// ---- Persisted elements (per-song reference subjects) ----------------------

export async function listElements(songId: string): Promise<SongElement[]> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't load elements."), res.status);
  return songElementListSchema.parse(data);
}

export async function createElement(songId: string, body: CreateElement): Promise<SongElement> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't create the element."), res.status);
  return songElementSchema.parse(data);
}

export async function updateElement(
  songId: string,
  elementId: string,
  body: UpdateElement,
): Promise<SongElement> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements/${elementId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the element."), res.status);
  return songElementSchema.parse(data);
}

export async function deleteElement(songId: string, elementId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements/${elementId}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't delete the element."), res.status);
  }
}

/** AI-generate an element reference image (uncommitted preview; same flow + price
 *  as cover generation). Call saveElementImage(key) to attach it. */
export async function generateElementImage(
  songId: string,
  elementId: string,
  prompt: string,
  model: CoverModel,
): Promise<CoverGenerateResponse> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements/${elementId}/image/generate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ prompt, model }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't generate the image."), res.status);
  return coverGenerateResponseSchema.parse(data);
}

/** Commit a generated image as the element's reference photo; returns the element. */
export async function saveElementImage(
  songId: string,
  elementId: string,
  key: string,
): Promise<SongElement> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/elements/${elementId}/image`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save the image."), res.status);
  return songElementSchema.parse(data);
}

/** Import an artist/album catalog from a Deezer link (metadata only). */
export async function importCatalog(url: string): Promise<CatalogImportResult> {
  const res = await fetch(`${API_BASE}/api/catalog/import`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ url }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't import that."), res.status);
  return catalogImportResultSchema.parse(data);
}

/** Distinct artist/album values from the user's other songs, for autosuggest. */
export async function getMetaSuggestions(): Promise<MetaSuggestions> {
  const res = await fetch(`${API_BASE}/api/songs/meta-suggestions`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't load suggestions."), res.status);
  return metaSuggestionsSchema.parse(data);
}

export async function updateSongLyrics(id: string, text: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/lyrics`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not save lyrics."), res.status);
  return songSchema.parse(data);
}

/** Save hand-corrected word timestamps from the fine-tune timing editor. */
export async function syncSongLyrics(id: string, lyrics: Lyrics): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/sync`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ lyrics }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not save timing."), res.status);
  return songSchema.parse(data);
}

export async function deleteSong(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/songs/${id}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Could not delete the song."), res.status);
  }
}

/** Fire-and-forget funnel "visited" ping. Sends the current path + referrer so
 *  the server can attribute SEO-landing arrivals (first-touch). Never throws. */
export async function trackVisit(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/track/visit`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        path: window.location.pathname + window.location.search,
        referrer: document.referrer || null,
      }),
      keepalive: true,
    });
  } catch {
    // analytics is best-effort
  }
}

export async function getPublicSong(id: string): Promise<PublicSong> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/public`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "This page isn't available."), res.status);
  return publicSongSchema.parse(data);
}

export async function rateSong(id: string, stars: number): Promise<RatingSummary> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/rating`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ stars }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save your rating."), res.status);
  return ratingSummarySchema.parse(data);
}

/** The AI "what the song is about" brief for the chosen style — prefilled into
 *  the generate modal so the user can confirm or override the video direction. */
export async function getVideoBrief(songId: string, style: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/video/brief`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ style }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't analyze the song."), res.status);
  if (data && typeof data === "object" && "brief" in data) {
    const { brief } = data as { brief?: unknown };
    if (typeof brief === "string") return brief;
  }
  return "";
}

/** Kick off lyric-video generation for a song. Returns the created job. */
export async function createLyricsVideo(
  songId: string,
  body: CreateVideoRequest,
): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/video`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start the video."), res.status);
  return videoJobSchema.parse(data);
}

/** Manual mode: regenerate one scene's image. `direction` is what the scene
 *  depicts (empty string clears it back to the lyric line). */
export async function regenerateSegment(
  jobId: string,
  index: number,
  direction?: string,
  noCast?: boolean,
): Promise<ReviewSegment> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}/segments/${index}/regenerate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({
      ...(direction === undefined ? {} : { direction }),
      ...(noCast === undefined ? {} : { noCast }),
    }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not regenerate this scene."), res.status);
  return reviewSegmentSchema.parse(data);
}

/** Motion editor: regenerate one scene's MOTION clip (optionally with an edited
 *  motion direction). Returns the updated review card (with the new clip URL). */
export async function regenerateClip(
  jobId: string,
  index: number,
  motionDirection?: string,
): Promise<ReviewSegment> {
  const res = await fetch(
    `${API_BASE}/api/video-jobs/${jobId}/segments/${index}/regenerate-clip`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(motionDirection === undefined ? {} : { motionDirection }),
    },
  );
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not regenerate this clip."), res.status);
  return reviewSegmentSchema.parse(data);
}

/** Motion editor: save a scene's motion direction without regenerating (a later
 *  re-render refreshes that clip). Returns the updated review card. */
export async function updateSegment(
  jobId: string,
  index: number,
  body: { motionDirection?: string | null },
): Promise<ReviewSegment> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}/segments/${index}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save that change."), res.status);
  return reviewSegmentSchema.parse(data);
}

/** Manual mode: update the job-wide shared fields (style + context). */
export async function updateVideoJob(jobId: string, body: UpdateVideoJob): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't save those changes."), res.status);
  return videoJobSchema.parse(data);
}

/** Promote a preview to the full music video, reusing its exact settings (also
 *  used as a retry). `permissive` retries Cinematic with the more permissive
 *  motion model when the default one rejected the frames. */
export async function generateFullVideo(
  songId: string,
  model: VideoModel,
  permissive = false,
): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/videos/${model}/full`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(permissive ? { permissive: true } : {}),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start the full video."), res.status);
  return videoJobSchema.parse(data);
}

/** Request a download variant (resolution × watermark). The variant is transcoded
 *  on demand + cached, so poll until status === "ready" then fetch `url`. */
export async function requestVideoDownload(
  songId: string,
  model: VideoModel,
  body: VideoDownloadRequest,
): Promise<VideoDownloadResponse> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/videos/${model}/download`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't prepare the download."), res.status);
  return videoDownloadResponseSchema.parse(data);
}

/** Delete a generated lyric video for one style. Returns the updated song. */
export async function deleteSongVideo(songId: string, model: VideoModel): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/videos/${model}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't delete the video."), res.status);
  return songSchema.parse(data);
}

/** Create a new style reusing another finished style's frames (skips image
 *  generation — charges only the motion step). */
export async function createVideoFromFrames(
  songId: string,
  targetModel: VideoModel,
  sourceModel: VideoModel,
  mode: "autopilot" | "manual" = "autopilot",
): Promise<VideoJob> {
  const res = await fetch(
    `${API_BASE}/api/songs/${songId}/videos/${targetModel}/from/${sourceModel}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ mode }),
    },
  );
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start the video."), res.status);
  return videoJobSchema.parse(data);
}

/** Re-open a finished full video for editing: clones its frames into a new manual
 *  review job so the user can swap scenes and re-render. */
export async function editVideo(songId: string, model: VideoModel): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/videos/${model}/edit`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not open the editor."), res.status);
  return videoJobSchema.parse(data);
}

/** Discard a manual review without rendering (cancel an "Edit scenes" session). */
export async function discardVideoEdit(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Couldn't discard the edits."), res.status);
  }
}

/** Manual mode: assemble the final video from the approved per-line images. */
export async function finalizeVideoJob(jobId: string): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}/finalize`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start the final video."), res.status);
  return videoJobSchema.parse(data);
}

/** Choose which generated lyric-video style is public (or null for none). */
export async function setPublicVideo(songId: string, model: VideoModel | null): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/public-video`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ model }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not update the public video."), res.status);
  return songSchema.parse(data);
}

/** Poll a video job for progress / the finished video URL. */
export async function getVideoJob(jobId: string): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load the video job."), res.status);
  return videoJobSchema.parse(data);
}

/** Cancel a still-running generation (stuck or no longer wanted): the server marks it
 *  failed and refunds the tokens. Returns the updated job. */
export async function cancelVideoJob(jobId: string): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}/cancel`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't cancel the generation."), res.status);
  return videoJobSchema.parse(data);
}

/** Switch an existing subscriber to a different plan (Stripe portal confirm flow). */
export async function changePlan(
  tier: CheckoutRequest["tier"],
  billingPeriod: BillingPeriod,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/billing/change-plan`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ tier, billingPeriod }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not change your plan."), res.status);
  return urlFrom(data);
}

export async function openBillingPortal(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/billing/portal`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not open billing portal."), res.status);
  return urlFrom(data);
}

// ---------------------------------------------------------------------------
// Programmatic SEO landing pages.
// ---------------------------------------------------------------------------

/** Public: fetch a published landing page by full slug (may contain "/"). */
export async function getLanding(slug: string): Promise<LandingPage> {
  const res = await fetch(`${API_BASE}/api/landing/${slug}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "This page isn't available."), res.status);
  return landingPageSchema.parse(data);
}

export async function listLandingPages(params?: {
  status?: string;
  category?: string;
  q?: string;
}): Promise<LandingAdmin[]> {
  const qs = new URLSearchParams(
    Object.entries(params ?? {}).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();
  const res = await fetch(`${API_BASE}/api/admin/landing${qs ? `?${qs}` : ""}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load pages."), res.status);
  return landingAdminSchema.array().parse(data);
}

export async function getLandingPage(id: string): Promise<LandingAdmin> {
  const res = await fetch(`${API_BASE}/api/admin/landing/${id}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load the page."), res.status);
  return landingAdminSchema.parse(data);
}

export async function createLandingPage(input: CreateLanding): Promise<LandingAdmin> {
  const res = await fetch(`${API_BASE}/api/admin/landing`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(input),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not create the page."), res.status);
  return landingAdminSchema.parse(data);
}

export async function updateLandingPage(id: string, patch: UpdateLanding): Promise<LandingAdmin> {
  const res = await fetch(`${API_BASE}/api/admin/landing/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(patch),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not save the page."), res.status);
  return landingAdminSchema.parse(data);
}

export async function setLandingPublished(id: string, published: boolean): Promise<LandingAdmin> {
  const res = await fetch(
    `${API_BASE}/api/admin/landing/${id}/${published ? "publish" : "unpublish"}`,
    { method: "POST", headers: { ...(await authHeaders()) } },
  );
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not change publish state."), res.status);
  return landingAdminSchema.parse(data);
}

export async function deleteLandingPage(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/landing/${id}`, {
    method: "DELETE",
    headers: { ...(await authHeaders()) },
  });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new ApiError(errorMessage(data, "Could not delete the page."), res.status);
  }
}

export async function getLandingAnalytics(): Promise<LandingFunnel[]> {
  const res = await fetch(`${API_BASE}/api/admin/landing/analytics`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not load analytics."), res.status);
  return landingFunnelSchema.array().parse(data);
}

// ---------------------------------------------------------------------------
// Server-backed mini-tools.
// ---------------------------------------------------------------------------

/** Free, anonymous: find streaming links for a title/artist or a pasted URL. */
export async function getToolLinks(params: {
  title?: string;
  artist?: string;
  url?: string;
}): Promise<LinkMatch> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();
  const res = await fetch(`${API_BASE}/api/tools/links?${qs}`, {
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't find links."), res.status);
  return linkMatchSchema.parse(data);
}

/** Metered (sign-in required): AI summary of pasted lyrics. */
export async function generateToolSummary(text: string): Promise<SongInsights> {
  const res = await fetch(`${API_BASE}/api/tools/summary`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't summarize."), res.status);
  return songInsightsSchema.parse(data);
}

/** Metered (sign-in required): detect sections / the chorus in pasted lyrics. */
export async function findChorus(text: string): Promise<ToolSectionsResponse> {
  const res = await fetch(`${API_BASE}/api/tools/sections`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ text }),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Couldn't analyze the lyrics."), res.status);
  return toolSectionsResponseSchema.parse(data);
}
