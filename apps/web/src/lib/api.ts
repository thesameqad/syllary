import {
  accountSchema,
  coverPresignResponseSchema,
  type CreateVideoRequest,
  type MetaSuggestions,
  metaSuggestionsSchema,
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
  type UpdateSong,
  type VideoJob,
  videoJobSchema,
  type VideoModel,
} from "@syllary/shared";

const API_BASE =
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

/** Fire-and-forget funnel "visited" ping. Never throws. */
export async function trackVisit(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/track/visit`, {
      method: "POST",
      headers: { ...(await authHeaders()) },
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

/** Manual mode: regenerate one line's image (optionally with an edited prompt). */
export async function regenerateSegment(
  jobId: string,
  index: number,
  prompt?: string,
): Promise<ReviewSegment> {
  const res = await fetch(`${API_BASE}/api/video-jobs/${jobId}/segments/${index}/regenerate`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(prompt ? { prompt } : {}),
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not regenerate this scene."), res.status);
  return reviewSegmentSchema.parse(data);
}

/** Promote a preview to the full music video, reusing its exact settings. */
export async function generateFullVideo(songId: string, model: VideoModel): Promise<VideoJob> {
  const res = await fetch(`${API_BASE}/api/songs/${songId}/videos/${model}/full`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not start the full video."), res.status);
  return videoJobSchema.parse(data);
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
