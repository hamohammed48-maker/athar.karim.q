import type { Chapter, ChapterDetail, Topic, Verse } from "@/types/quran";
import { idbGet, idbGetAll, idbPut } from "@/lib/persistence/idb";

type StoredChapter = { id: string; chapterId: number; data: ChapterDetail; downloadedAt: string };
type StoredChapterIndex = { id: "chapters:index"; chapters: Chapter[] };
type StoredTopics = { id: "topics:index"; topics: Topic[] };
const keyFor = (chapterId: number) => `chapter:${chapterId}`;

export async function saveOfflineChapter(chapterId: number, data: ChapterDetail): Promise<void> {
  if (data.chapter.id !== chapterId || !Array.isArray(data.verses) || data.verses.length !== data.chapter.verses_count) {
    throw new Error("بيانات السورة غير مكتملة، لذلك لم تُحفظ على الجهاز.");
  }
  await idbPut<StoredChapter>("offline-content", {
    id: keyFor(chapterId), chapterId, data, downloadedAt: new Date().toISOString(),
  });
  const current = await loadOfflineChapterIndex().catch(() => []);
  const merged = [...current.filter((chapter) => chapter.id !== data.chapter.id), data.chapter]
    .sort((a, b) => a.id - b.id);
  await saveOfflineChapterIndex(merged);
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
}

export async function loadOfflineChapter(chapterId: number): Promise<ChapterDetail | undefined> {
  return (await idbGet<StoredChapter>("offline-content", keyFor(chapterId)))?.data;
}

export async function getDownloadedChapterIds(): Promise<number[]> {
  const rows = await idbGetAll<StoredChapter>("offline-content");
  return rows.filter((row) => typeof row.chapterId === "number" && row.id === keyFor(row.chapterId))
    .map((row) => row.chapterId).sort((a, b) => a - b);
}

export async function getDownloadedChapters(): Promise<ChapterDetail[]> {
  const rows = await idbGetAll<StoredChapter>("offline-content");
  return rows.filter((row) => typeof row.chapterId === "number" && row.id === keyFor(row.chapterId)
    && row.data?.chapter?.id === row.chapterId).map((row) => row.data)
    .sort((a, b) => a.chapter.id - b.chapter.id);
}

export async function saveOfflineChapterIndex(chapters: Chapter[]): Promise<void> {
  await idbPut<StoredChapterIndex>("offline-content", { id: "chapters:index", chapters });
}

export async function loadOfflineChapterIndex(): Promise<Chapter[]> {
  const stored = await idbGet<StoredChapterIndex>("offline-content", "chapters:index");
  if (stored?.chapters?.length) return stored.chapters;
  return (await getDownloadedChapters()).map((item) => item.chapter);
}

export async function saveOfflineTopics(topics: Topic[]): Promise<void> {
  await idbPut<StoredTopics>("offline-content", { id: "topics:index", topics });
}

export async function loadOfflineTopics(): Promise<Topic[]> {
  return (await idbGet<StoredTopics>("offline-content", "topics:index"))?.topics ?? [];
}

export async function getOfflineVersesByKeys(keys: string[]): Promise<Verse[]> {
  if (!keys.length) return [];
  const wanted = new Set(keys);
  const byKey = new Map<string, Verse>();
  for (const chapter of await getDownloadedChapters()) {
    for (const verse of chapter.verses) if (wanted.has(verse.key)) byKey.set(verse.key, verse);
  }
  return keys.flatMap((key) => byKey.has(key) ? [byKey.get(key)!] : []);
}

function normalizeArabic(value: string): string {
  return (value || "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, "")
    .replace(/[أإآٱٲٳ]/g, "ا").replace(/ى/g, "ي").replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و").replace(/[ةۀ]/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ").replace(/\s+/g, " ").trim();
}

export async function searchDownloadedVerses(query: string, chapterId: number | null, limit = 100) {
  const needle = normalizeArabic(query);
  if (needle.length < 2) return { results: [] as Verse[], total: 0, indexedChapters: 0 };
  const chapters = await getDownloadedChapters();
  const matches = chapters.filter((item) => chapterId === null || item.chapter.id === chapterId)
    .flatMap((item) => item.verses).filter((verse) => normalizeArabic(verse.text).includes(needle))
    .sort((a, b) => a.chapter - b.chapter || a.number - b.number);
  return { results: matches.slice(0, limit), total: matches.length, indexedChapters: chapters.length };
}

export async function getRandomDownloadedVerse(exclude: string[] = []): Promise<Verse | undefined> {
  const excluded = new Set(exclude);
  const verses = (await getDownloadedChapters()).flatMap((item) => item.verses)
    .filter((verse) => !excluded.has(verse.key));
  return verses.length ? verses[Math.floor(Math.random() * verses.length)] : undefined;
}

export async function resolveOfflineChapterRequest<T>(path: string): Promise<T | undefined> {
  const match = new URL(path, "https://offline.invalid").pathname.match(/^\/offline\/chapters\/(\d+)$/);
  if (!match) return undefined;
  return (await loadOfflineChapter(Number(match[1]))) as T | undefined;
}


export async function checkOfflineQuranIntegrity() {
  const chapters = await getDownloadedChapters();
  const issues: string[] = [];
  let versesCount = 0;
  if (!chapters.length) issues.push("لا توجد سور محفوظة للفحص.");
  for (const item of chapters) {
    const expected = item.chapter.verses_count;
    if (item.verses.length !== expected) {
      issues.push(`سورة ${item.chapter.id}: عدد الآيات ${item.verses.length}/${expected}`);
    }
    const seen = new Set<string>();
    const numbers = item.verses.map((verse) => verse.number).sort((a, b) => a - b);
    if (numbers.some((number, index) => number !== index + 1)) issues.push(`سورة ${item.chapter.id}: تسلسل أرقام الآيات غير مكتمل.`);
    for (const verse of item.verses) {
      versesCount += 1;
      if (seen.has(verse.key)) issues.push(`معرّف مكرر ${verse.key}`);
      seen.add(verse.key);
      if (verse.key !== `${verse.chapter}:${verse.number}`) issues.push(`مرجع غير متطابق ${verse.key}`);
      if (!verse.text?.trim() || !verse.translation?.trim() || !Array.isArray(verse.words) || !verse.words.length) {
        issues.push(`بيانات ناقصة في ${verse.key}`);
      }
    }
  }
  return {
    ok: issues.length === 0,
    chapters_count: chapters.length,
    expected_chapters: 114,
    cached_chapters: chapters.length,
    verses_count: versesCount,
    expected_verses: 6236,
    issues: issues.slice(0, 50),
    source: "قاعدة البيانات المحلية داخل التطبيق (IndexedDB)",
  };
}
