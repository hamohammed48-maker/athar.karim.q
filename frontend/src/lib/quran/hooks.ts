import { useQueries, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  getOfflineVersesByKeys, getRandomDownloadedVerse, loadOfflineChapter, loadOfflineChapterIndex,
  loadOfflineReciters, loadOfflineTopics, saveOfflineChapterIndex, saveOfflineReciters,
  saveOfflineTopics, searchDownloadedVerses,
} from "@/lib/offlineChapters";
import { getDownloadedChapterAudio } from "@/lib/audio/offlineAudio";
import type { Chapter, ChapterAudio, ChapterDetail, Reciter, SearchResponse, Topic, TopicDetail, Verse } from "@/types/quran";

const DAY = 24 * 60 * 60 * 1000;

export const useChapters = () =>
  useQuery({
    queryKey: ["chapters"],
    queryFn: async () => {
      // Local-first: a saved index is authoritative for this launch; do not contact the API.
      const local = await loadOfflineChapterIndex();
      if (local.length) return local;
      const chapters = await apiGet<Chapter[]>("/quran/chapters");
      await saveOfflineChapterIndex(chapters).catch(() => undefined);
      return chapters;
    },
    staleTime: DAY,
  });

export const useChapter = (n: number | null) =>
  useQuery({
    queryKey: ["chapter", n],
    queryFn: async () => {
      // Read the downloaded chapter directly from IndexedDB before considering the API.
      const local = await loadOfflineChapter(n!);
      if (local && local.chapter.id === n && Array.isArray(local.verses)
        && local.verses.length === local.chapter.verses_count) return local;
      return apiGet<ChapterDetail>(`/offline/chapters/${n}`);
    },
    enabled: !!n,
    staleTime: DAY,
  });

export const useVersesByKeys = (keys: string[]) =>
  useQuery({
    queryKey: ["verses", keys.join(",")],
    queryFn: async () => {
      const local = await getOfflineVersesByKeys(keys);
      if (local.length === keys.length) return local;
      return apiGet<Verse[]>(`/quran/verses?keys=${encodeURIComponent(keys.join(","))}`);
    },
    enabled: keys.length > 0,
    staleTime: DAY,
  });

export const useSearch = (q: string, chapter: number | null) =>
  useQuery({
    queryKey: ["search", q, chapter],
    queryFn: async (): Promise<SearchResponse> => {
      const local = await searchDownloadedVerses(q, chapter);
      return { query: q, total: local.total, results: local.results, indexed_chapters: local.indexedChapters };
    },
    enabled: q.trim().length >= 2,
    staleTime: DAY,
  });

export const useTopics = () =>
  useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      // Local-first: a downloaded topic index must render without waiting for the API.
      const local = await loadOfflineTopics();
      if (local.length) return local;

      // The API is only a first-install / missing-local-data fallback.
      const topics = await apiGet<Topic[]>("/quran/topics");
      await saveOfflineTopics(topics).catch(() => undefined);
      return topics;
    },
    staleTime: DAY,
  });

export const useTopic = (id: string | null) =>
  useQuery({
    queryKey: ["topic", id],
    queryFn: async (): Promise<TopicDetail> => {
      let topics = await loadOfflineTopics();
      if (!topics.length) {
        try {
          topics = await apiGet<Topic[]>("/quran/topics");
          await saveOfflineTopics(topics).catch(() => undefined);
        } catch {
          throw new Error("قائمة المواضيع غير محفوظة على الجهاز. اتصل بالإنترنت مرة واحدة لتحميلها.");
        }
      }
      const topic = topics.find((item) => item.id === id);
      if (!topic) throw new Error("الموضوع غير موجود.");

      // Reuse downloaded verses and request only the missing verse keys.
      const localVerses = await getOfflineVersesByKeys(topic.verse_keys);
      if (localVerses.length === topic.verse_keys.length) return { ...topic, verses: localVerses };

      const localKeys = new Set(localVerses.map((verse) => verse.key));
      const missingKeys = topic.verse_keys.filter((key) => !localKeys.has(key));
      try {
        const missingVerses = await apiGet<Verse[]>(
          `/quran/verses?keys=${encodeURIComponent(missingKeys.join(","))}`,
        );
        const byKey = new Map([...localVerses, ...missingVerses].map((verse) => [verse.key, verse]));
        const verses = topic.verse_keys.flatMap((key) => {
          const verse = byKey.get(key);
          return verse ? [verse] : [];
        });
        return { ...topic, verses };
      } catch {
        if (localVerses.length) return { ...topic, verses: localVerses };
        throw new Error("آيات هذا الموضوع غير محفوظة. اتصل بالإنترنت لتحميل الآيات الناقصة.");
      }
    },
    enabled: !!id,
    staleTime: DAY,
  });

export const useReciters = () =>
  useQuery({
    queryKey: ["reciters"],
    queryFn: async () => {
      const local = await loadOfflineReciters();
      if (local.length) return local;
      const reciters = await apiGet<Reciter[]>("/quran/reciters");
      await saveOfflineReciters(reciters).catch(() => undefined);
      return reciters;
    },
    staleTime: DAY,
  });

export const fetchChapterAudio = (reciterId: number, chapter: number) =>
  apiGet<ChapterAudio>(`/quran/audio/${reciterId}/${chapter}`);

export const audioQuery = (reciterId: number, chapter: number) => ({
  queryKey: ["audio", reciterId, chapter],
  queryFn: async () => {
    // A downloaded audio blob and its verse timings are sufficient for offline playback.
    const local = await getDownloadedChapterAudio(reciterId, chapter);
    if (local) return local;
    return fetchChapterAudio(reciterId, chapter);
  },
  staleTime: DAY,
  retry: 1,
});

export const useChapterAudio = (reciterId: number | null, chapter: number | null) =>
  useQuery({ ...audioQuery(reciterId ?? 0, chapter ?? 0), enabled: !!reciterId && !!chapter });

export function useSelectionAudio(reciterId: number | null, chapters: number[]) {
  return useQueries({
    queries: chapters.map((c) => ({ ...audioQuery(reciterId ?? 0, c), enabled: !!reciterId })),
  });
}

export const fetchRandomVerse = async (exclude: string[]) => {
  const local = await getRandomDownloadedVerse(exclude);
  if (local) return local;
  return apiGet<Verse>(`/quran/random?exclude=${encodeURIComponent(exclude.slice(-30).join(","))}`);
};
