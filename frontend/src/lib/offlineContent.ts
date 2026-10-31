import type { Chapter, ChapterDetail, SearchResponse, Topic, TopicDetail, Verse, IntegrityReport, Reciter } from "@/types/quran";
import { idbGet, idbPut } from "@/lib/persistence/idb";
import { API_BASE_URL } from "@/lib/apiConfig";

export interface OfflineQuranBundle {
  schema_version: number;
  generated_at: string;
  source: { quran: string; translation: string; attribution: string };
  translation: { resource_id: number; name: string; author_name: string };
  sync: { resources_filter: string; next_sync_token: string; last_sync_at: string };
  chapters: Chapter[];
  verses: Verse[];
  topics: Topic[];
  reciters: Reciter[];
  audio: unknown[];
}

interface StoredBundle {
  id: "quran";
  bundle: OfflineQuranBundle;
  stored_at: string;
}

let bundlePromise: Promise<OfflineQuranBundle> | null = null;

function validateBundle(value: OfflineQuranBundle) {
  if (value.schema_version !== 1 || value.chapters?.length !== 114 || value.verses?.length !== 6236) {
    throw new Error("حزمة القرآن المحلية غير مكتملة أو بإصدار غير مدعوم");
  }
}

export function loadOfflineQuranBundle(): Promise<OfflineQuranBundle> {
  if (!bundlePromise) {
    bundlePromise = idbGet<StoredBundle>("offline-content", "quran")
      .then((stored) => {
        if (!stored?.bundle) throw new Error("لم تُنزّل بيانات القرآن للعمل دون إنترنت بعد");
        validateBundle(stored.bundle);
        return stored.bundle;
      })
      .catch((error) => {
        bundlePromise = null;
        throw error;
      });
  }
  return bundlePromise;
}

export async function syncOfflineQuranBundle(): Promise<{ bundle: OfflineQuranBundle; updated: boolean }> {
  const stored = await idbGet<StoredBundle>("offline-content", "quran").catch(() => undefined);
  const knownVersion = stored?.bundle.generated_at;
  const query = knownVersion ? "?known_version=" + encodeURIComponent(knownVersion) : "";
  const response = await fetch(API_BASE_URL + "/offline/quran-bundle" + query, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === "string" ? body.detail : "تعذّر تنزيل بيانات القرآن. تحقق من الاتصال وإعداد الخادم.";
    throw new Error(detail);
  }

  const payload = await response.json();
  let bundle: OfflineQuranBundle;
  let updated = false;

  if (payload.status === "updated" && payload.bundle) {
    bundle = payload.bundle as OfflineQuranBundle;
    validateBundle(bundle);
    await idbPut<StoredBundle>("offline-content", {
      id: "quran",
      bundle,
      stored_at: new Date().toISOString(),
    });
    updated = true;
  } else if (payload.status === "unchanged" && stored?.bundle) {
    bundle = {
      ...stored.bundle,
      sync: {
        ...stored.bundle.sync,
        next_sync_token: payload.next_sync_token || stored.bundle.sync.next_sync_token,
        resources_filter: payload.resources_filter || stored.bundle.sync.resources_filter,
        last_sync_at: payload.last_sync_at || new Date().toISOString(),
      },
    };
    await idbPut<StoredBundle>("offline-content", {
      ...stored,
      bundle,
      stored_at: new Date().toISOString(),
    });
  } else {
    throw new Error("استجابة تحديث بيانات القرآن غير مكتملة.");
  }

  try {
    await navigator.storage?.persist?.();
  } catch {
    // IndexedDB remains usable even if persistent-storage permission is unavailable.
  }
  bundlePromise = Promise.resolve(bundle);
  return { bundle, updated };
}

export async function maybeSyncOfflineQuranBundle(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  try {
    const bundle = await loadOfflineQuranBundle();
    const lastSync = Date.parse(bundle.sync.last_sync_at || bundle.generated_at);
    const sixDays = 6 * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(lastSync) || Date.now() - lastSync >= sixDays) {
      await syncOfflineQuranBundle();
    }
  } catch {
    // No local copy yet, or offline/unreachable backend. Keep the app usable.
  }
}

const normalizeArabic = (value: string) =>
  value
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, "")
    .replace(/[أإآٱٲٳ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ة/g, "ه")
    .replace(/[^\u0621-\u064A\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export async function resolveOfflineQuranRequest<T>(path: string): Promise<T | undefined> {
  const bundle = await loadOfflineQuranBundle();
  const url = new URL(path, "https://offline.invalid");
  const pathname = url.pathname;

  if (pathname === "/quran/chapters") return bundle.chapters as T;
  if (pathname === "/quran/reciters") return bundle.reciters as T;
  if (pathname === "/quran/topics") return bundle.topics as T;

  const chapterMatch = pathname.match(/^\/quran\/chapters\/(\d+)$/);
  if (chapterMatch) {
    const chapterId = Number(chapterMatch[1]);
    const chapter = bundle.chapters.find((item) => item.id === chapterId);
    if (!chapter) return undefined;
    return {
      chapter,
      verses: bundle.verses.filter((verse) => verse.chapter === chapterId),
    } as ChapterDetail as T;
  }

  if (pathname === "/quran/verses") {
    const keys = (url.searchParams.get("keys") || "").split(",").filter(Boolean);
    const byKey = new Map(bundle.verses.map((verse) => [verse.key, verse]));
    return keys.map((key) => byKey.get(key)).filter((verse): verse is Verse => !!verse) as T;
  }

  if (pathname === "/quran/search") {
    const query = normalizeArabic(url.searchParams.get("q") || "");
    const chapter = Number(url.searchParams.get("chapter") || 0);
    if (query.length < 2) return undefined;
    const matches = bundle.verses.filter((verse) => {
      if (chapter && verse.chapter !== chapter) return false;
      return normalizeArabic(verse.text).includes(query);
    });
    const result: SearchResponse = {
      query: url.searchParams.get("q") || "",
      total: matches.length,
      results: matches.slice(0, 40),
      indexed_chapters: bundle.chapters.length,
    };
    return result as T;
  }

  if (pathname === "/quran/random") {
    const excluded = new Set((url.searchParams.get("exclude") || "").split(",").filter(Boolean));
    const available = bundle.verses.filter((verse) => !excluded.has(verse.key));
    if (!available.length) return undefined;
    return available[Math.floor(Math.random() * available.length)] as T;
  }

  if (pathname === "/quran/integrity") {
    const report: IntegrityReport = {
      ok: bundle.chapters.length === 114 && bundle.verses.length === 6236,
      chapters_count: bundle.chapters.length,
      expected_chapters: 114,
      cached_chapters: bundle.chapters.length,
      verses_count: bundle.verses.length,
      expected_verses: 6236,
      issues: [],
      source: bundle.source.quran,
    };
    return report as T;
  }

  const topicMatch = pathname.match(/^\/quran\/topics\/([^/]+)$/);
  if (topicMatch) {
    const topic = bundle.topics.find((item) => item.id === decodeURIComponent(topicMatch[1]));
    if (!topic) return undefined;
    const keys = new Set(topic.verse_keys);
    return {
      ...topic,
      verses: bundle.verses.filter((verse) => keys.has(verse.key)),
    } as TopicDetail as T;
  }

  return undefined;
}
