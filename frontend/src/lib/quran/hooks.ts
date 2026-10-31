import { useQueries, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Chapter, ChapterAudio, ChapterDetail, Reciter, SearchResponse, Topic, TopicDetail, Verse } from "@/types/quran";

const DAY = 24 * 60 * 60 * 1000;

export const useChapters = () =>
  useQuery({ queryKey: ["chapters"], queryFn: () => apiGet<Chapter[]>("/quran/chapters"), staleTime: DAY });

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
    queryFn: () => apiGet<Verse[]>(`/quran/verses?keys=${encodeURIComponent(keys.join(","))}`),
    enabled: keys.length > 0,
    staleTime: DAY,
  });

export const useSearch = (q: string, chapter: number | null) =>
  useQuery({
    queryKey: ["search", q, chapter],
    queryFn: () =>
      apiGet<SearchResponse>(`/quran/search?q=${encodeURIComponent(q)}${chapter ? `&chapter=${chapter}` : ""}`),
    enabled: q.trim().length >= 2,
    staleTime: DAY,
  });

export const useTopics = () =>
  useQuery({ queryKey: ["topics"], queryFn: () => apiGet<Topic[]>("/quran/topics"), staleTime: DAY });

export const useTopic = (id: string | null) =>
  useQuery({
    queryKey: ["topic", id],
    queryFn: () => apiGet<TopicDetail>(`/quran/topics/${id}`),
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

/** Audio metadata for every chapter touched by a selection (one cached request per chapter). */
export function useSelectionAudio(reciterId: number | null, chapters: number[]) {
  return useQueries({
    queries: chapters.map((c) => ({ ...audioQuery(reciterId ?? 0, c), enabled: !!reciterId })),
  });
}

export const fetchRandomVerse = (exclude: string[]) =>
  apiGet<Verse>(`/quran/random?exclude=${encodeURIComponent(exclude.slice(-30).join(","))}`);
