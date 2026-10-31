// Mirrors backend/models/quran.py — keep in sync by hand.
export interface Chapter {
  id: number;
  name_arabic: string;
  name_simple: string;
  translated_name: string;
  revelation_place: string;
  revelation_order: number;
  verses_count: number;
  bismillah_pre: boolean;
  pages: number[];
}

export interface Word {
  position: number;
  text: string;
}

export interface Verse {
  key: string;
  chapter: number;
  number: number;
  text: string;
  words: Word[];
  translation: string;
  juz: number;
  page: number;
}

export interface ChapterDetail {
  chapter: Chapter;
  verses: Verse[];
}

export interface SearchResponse {
  query: string;
  total: number;
  results: Verse[];
  indexed_chapters: number;
}

export interface Topic {
  id: string;
  name: string;
  description: string;
  verse_keys: string[];
  complete: boolean;
  note: string;
}

export interface TopicDetail extends Topic {
  verses: Verse[];
}

export interface Reciter {
  id: number;
  name: string;
  name_en: string;
  style: string;
}

export interface VerseTiming {
  verse_key: string;
  start_ms: number;
  end_ms: number;
  segments: number[][];
}

export interface ChapterAudio {
  reciter_id: number;
  chapter: number;
  audio_url: string;
  duration_ms: number;
  has_word_timing: boolean;
  timings: VerseTiming[];
}

export interface IntegrityReport {
  ok: boolean;
  chapters_count: number;
  expected_chapters: number;
  cached_chapters: number;
  verses_count: number;
  expected_verses: number;
  issues: string[];
  source: string;
}
