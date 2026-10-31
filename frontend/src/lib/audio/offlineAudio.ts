import { idbDelete, idbGet, idbGetAll, idbPut } from "@/lib/persistence/idb";
import { fetchChapterAudio } from "@/lib/quran/hooks";
import type { ChapterAudio, Reciter } from "@/types/quran";

const PREFIX = "quran-audio:";
export interface DownloadedAudio {
  id: string;
  kind: "quran-audio";
  reciterId: number;
  reciterName: string;
  chapterId: number;
  chapterName: string;
  size: number;
  downloadedAt: string;
  blob: Blob;
}
const key = (reciterId: number, chapterId: number) => `${PREFIX}${reciterId}:${chapterId}`;

export async function downloadChapterAudio(
  reciter: Reciter, chapterId: number, chapterName: string,
  onProgress?: (value: number) => void,
): Promise<DownloadedAudio> {
  const audio = await fetchChapterAudio(reciter.id, chapterId);
  const response = await fetch(audio.audio_url);
  if (!response.ok) throw new Error("تعذّر تنزيل الملف الصوتي من مصدر التلاوة.");
  const blob = await response.blob();
  if (!blob.size) throw new Error("ملف الصوت فارغ.");
  const item: DownloadedAudio = {
    id: key(reciter.id, chapterId), kind: "quran-audio",
    reciterId: reciter.id, reciterName: reciter.name,
    chapterId, chapterName, size: blob.size,
    downloadedAt: new Date().toISOString(), blob,
  };
  await idbPut("media", item);
  onProgress?.(100);
  return item;
}

export async function getDownloadedAudio(reciterId: number, chapterId: number) {
  return idbGet<DownloadedAudio>("media", key(reciterId, chapterId));
}
export async function listDownloadedAudio(): Promise<DownloadedAudio[]> {
  const rows = await idbGetAll<DownloadedAudio>("media");
  return rows.filter((x) => x.kind === "quran-audio" && x.id.startsWith(PREFIX))
    .sort((a, b) => a.chapterId - b.chapterId || a.reciterName.localeCompare(b.reciterName));
}
export async function deleteDownloadedAudio(id: string) {
  await idbDelete("media", id);
}
export async function getDownloadedAudioUrl(reciterId: number, chapterId: number): Promise<string | null> {
  const item = await getDownloadedAudio(reciterId, chapterId);
  return item?.blob ? URL.createObjectURL(item.blob) : null;
}
