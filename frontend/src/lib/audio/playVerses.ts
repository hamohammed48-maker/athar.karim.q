import { queryClient } from "@/lib/queryClient";
import { audioQuery } from "@/lib/quran/hooks";
import { buildTimeline, quranPlayer, type TimelineItem } from "@/lib/audio/player";
import { getSettings } from "@/lib/settings";
import { getDownloadedAudioUrl } from "@/lib/audio/offlineAudio";
import { toast } from "sonner";
import type { ChapterAudio } from "@/types/quran";

export async function loadTimeline(verseKeys: string[], reciterId: number): Promise<TimelineItem[]> {
  const chapters = [...new Set(verseKeys.map((k) => Number(k.split(":")[0])))];
  const audios = await Promise.all(chapters.map(async (c) => {
    const cached = await getDownloadedAudioUrl(reciterId, c);
    if (cached) {
      const remote = await queryClient.fetchQuery<ChapterAudio>(audioQuery(reciterId, c)).catch(() => null);
      if (remote) return { ...remote, audio_url: cached };
    }
    return queryClient.fetchQuery<ChapterAudio>(audioQuery(reciterId, c));
  }));
  return buildTimeline(verseKeys, audios);
}

/** Plays given verses with the user's default reciter on the shared Quran player. */
export async function playVerses(verseKeys: string[], startIndex = 0, reciterId = getSettings().reciterId) {
  try {
    const items = await loadTimeline(verseKeys, reciterId);
    quranPlayer.load(items, startIndex);
    await quranPlayer.play(startIndex);
  } catch (e) {
    toast.error(e instanceof Error && e.message.includes("لا تتوفر") ? e.message : "تعذّر تحميل التلاوة — تحقق من الاتصال");
  }
}
