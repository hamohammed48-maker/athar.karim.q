import { useQueries, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import {
  getOfflineVersesByKeys, getRandomDownloadedVerse, loadOfflineChapterIndex, loadOfflineTopics,
  saveOfflineChapterIndex, saveOfflineTopics, searchDownloadedVerses,
} from "@/lib/offlineChapters";
import type { Chapter, ChapterAudio, ChapterDetail, Reciter, SearchResponse, Topic, TopicDetail, Verse } from "@/types/quran";

const DAY = 24 * 60 * 60 * 1000;

export const useChapters = () =>
  useQuery({
    queryKey: ["chapters"],
    queryFn: async () => {
      try {
        const chapters = await apiGet<Chapter[]>("/quran/chapters");
        await saveOfflineChapterIndex(chapters).catch(() => undefined);
        return chapters;
      } catch (error) {
        const local = await loadOfflineChapterIndex();
        if (local.length) return local;
        throw error;
      }
    },
    staleTime: DAY,
  });

export const useChapter = (n: number | null) =>
  useQuery({
    queryKey: ["chapter", n],
    queryFn: () => apiGet<ChapterDetail>(`/offline/chapters/${n}`),
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
      try {
        const topics = await apiGet<Topic[]>("/quran/topics");
        await saveOfflineTopics(topics).catch(() => undefined);
        return topics;
      } catch (error) {
        const local = await loadOfflineTopics();
        if (local.length) return local;
        throw error;
      }
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
      const localVerses = await getOfflineVersesByKeys(topic.verse_keys);
      if (localVerses.length === topic.verse_keys.length) return { ...topic, verses: localVerses };
      try {
        return await apiGet<TopicDetail>(`/quran/topics/${id}`);
      } catch {
        if (localVerses.length) return { ...topic, verses: localVerses };
        throw new Error("آيات هذا الموضوع غير محفوظة. نزّل السور التي تحتويها عند توفر الإنترنت.");
      }
    },
    enabled: !!id,
    staleTime: DAY,
  });

export const useReciters = () =>
  useQuery({ queryKey: ["reciters"], queryFn: () => apiGet<Reciter[]>("/quran/reciters"), staleTime: DAY });

export const fetchChapterAudio = (reciterId: number, chapter: number) =>
  apiGet<ChapterAudio>(`/quran/audio/${reciterId}/${chapter}`);

export const audioQuery = (reciterId: number, chapter: number) => ({
  queryKey: ["audio", reciterId, chapter],
  queryFn: () => fetchChapterAudio(reciterId, chapter),
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
