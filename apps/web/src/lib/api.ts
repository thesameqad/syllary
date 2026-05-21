import {
  accountSchema,
  presignResponseSchema,
  songSchema,
  type Account,
  type BillingPeriod,
  type PresignRequest,
  type PresignResponse,
  type Song,
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
  file: File,
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
    xhr.send(file);
  });
}

export async function processSong(id: string): Promise<Song> {
  const res = await fetch(`${API_BASE}/api/songs/${id}/process`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not process track."), res.status);
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
  tier: "starter" | "creator" | "pro",
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

export async function openBillingPortal(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/billing/portal`, {
    method: "POST",
    headers: { ...(await authHeaders()) },
  });
  const data: unknown = await res.json();
  if (!res.ok) throw new ApiError(errorMessage(data, "Could not open billing portal."), res.status);
  return urlFrom(data);
}
