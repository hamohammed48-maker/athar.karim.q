import { resolveOfflineChapterRequest, saveOfflineChapter } from "@/lib/offlineChapters";
import { API_BASE_URL } from "@/lib/apiConfig";
import type { ChapterDetail } from "@/types/quran";

// The website uses the relative /api prefix; Android builds supply the public API origin.
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
    return await resolveOfflineChapterRequest<T>(path);
  } catch {
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
  const data = (await res.json()) as T;
  const chapterMatch = method === "GET" && path.match(/^\/offline\/chapters\/(\d+)$/);
  if (chapterMatch) {
    await saveOfflineChapter(Number(chapterMatch[1]), data as ChapterDetail);
  }
  return data;
}

export const apiGet = <T>(path: string) => request<T>("GET", path);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
