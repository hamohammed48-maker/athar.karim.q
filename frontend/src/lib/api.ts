import { resolveOfflineQuranRequest } from "@/lib/offlineContent";
import { API_BASE_URL } from "@/lib/apiConfig";

// Typed fetch layer over the FastAPI backend. Base is the relative "/api" prefix so the
// same code works in dev (Vite proxies /api → :8001) and behind a single origin in prod.

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super("request failed with " + status);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function offlineGet<T>(path: string): Promise<T | undefined> {
  try {
    return await resolveOfflineQuranRequest<T>(path);
  } catch {
    // A build without approved Content Sync credentials has no bundled Quran dataset.
    return undefined;
  }
}

async function request<T>(method: string, path: string, body?: JsonBody): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE_URL + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (method === "GET") {
      const local = await offlineGet<T>(path);
      if (local !== undefined) return local;
    }
    throw error;
  }

  if (!res.ok) {
    if (method === "GET" && (res.status >= 500 || res.status === 404 || res.status === 401 || res.status === 403)) {
      const local = await offlineGet<T>(path);
      if (local !== undefined) return local;
    }
    const errBody = await res.json().catch(() => null);
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
