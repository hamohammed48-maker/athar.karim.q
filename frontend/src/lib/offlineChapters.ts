import type { ChapterDetail } from "@/types/quran";
import { idbGet, idbGetAll, idbPut } from "@/lib/persistence/idb";

type StoredChapter = {
  id: string;
  chapterId: number;
  data: ChapterDetail;
  downloadedAt: string;
};

const keyFor = (chapterId: number) => `chapter:${chapterId}`;

export async function saveOfflineChapter(chapterId: number, data: ChapterDetail): Promise<void> {
  if (data.chapter.id !== chapterId || !Array.isArray(data.verses) || data.verses.length !== data.chapter.verses_count) {
    throw new Error("بيانات السورة غير مكتملة، لذلك لم تُحفظ على الجهاز.");
  }
  await idbPut<StoredChapter>("offline-content", {
    id: keyFor(chapterId),
    chapterId,
    data,
    downloadedAt: new Date().toISOString(),
  });
  try {
    await navigator.storage?.persist?.();
  } catch {
    // IndexedDB remains available even when persistent storage is not granted.
  }
}

export async function loadOfflineChapter(chapterId: number): Promise<ChapterDetail | undefined> {
  const stored = await idbGet<StoredChapter>("offline-content", keyFor(chapterId));
  return stored?.data;
}

export async function getDownloadedChapterIds(): Promise<number[]> {
  const rows = await idbGetAll<StoredChapter>("offline-content");
  return rows
    .filter((row) => typeof row.chapterId === "number" && row.id === keyFor(row.chapterId))
    .map((row) => row.chapterId)
    .sort((a, b) => a - b);
}

export async function resolveOfflineChapterRequest<T>(path: string): Promise<T | undefined> {
  const match = new URL(path, "https://offline.invalid").pathname.match(/^\/offline\/chapters\/(\d+)$/);
  if (!match) return undefined;
  return (await loadOfflineChapter(Number(match[1]))) as T | undefined;
}
