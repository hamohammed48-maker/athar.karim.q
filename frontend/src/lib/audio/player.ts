import { useSyncExternalStore } from "react";
import type { ChapterAudio } from "@/types/quran";

/** One verse on the playback timeline: a slice [startMs, endMs] of a chapter audio file. */
export interface TimelineItem {
  verseKey: string;
  url: string;
  startMs: number;
  endMs: number;
  segments: number[][]; // [wordPosition, startMs, endMs] — real timing data from Quran.com
}

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "ended" | "error";

export interface PlayerSnapshot {
  status: PlayerStatus;
  index: number;
  verseKey: string | null;
  itemMs: number; // absolute position inside the current file
  globalMs: number; // position on the whole timeline
  totalMs: number;
  activeWord: number | null;
  error: string | null;
  rate: number;
}

/** Builds a timeline from real per-verse timings. Throws when a verse has no timing for this reciter. */
export function buildTimeline(verseKeys: string[], audios: ChapterAudio[]): TimelineItem[] {
  return verseKeys.map((key) => {
    const ch = Number(key.split(":")[0]);
    const a = audios.find((x) => x.chapter === ch);
    const t = a?.timings.find((x) => x.verse_key === key);
    if (!a || !t || t.end_ms <= t.start_ms) throw new Error(`لا تتوفر تلاوة للآية ${key} لدى هذا القارئ`);
    return { verseKey: key, url: a.audio_url, startMs: t.start_ms, endMs: t.end_ms, segments: t.segments };
  });
}

export const timelineDuration = (items: TimelineItem[]) => items.reduce((s, i) => s + (i.endMs - i.startMs), 0);

export const timelineHasWordTiming = (items: TimelineItem[]) => items.length > 0 && items.every((i) => i.segments.length > 0);

export function activeWordAt(item: TimelineItem | undefined, ms: number): number | null {
  if (!item) return null;
  for (const [pos, s, e] of item.segments) if (ms >= s && ms < e) return pos;
  return null;
}

/**
 * Plays a list of verse slices on a single <audio> element (CDN sends CORS *, so it can feed Web Audio).
 * Word/verse state is derived from audio.currentTime, so highlighting follows seeking exactly.
 */
export class RecitationPlayer {
  audio: HTMLAudioElement;
  items: TimelineItem[] = [];
  private index = 0;
  private status: PlayerStatus = "idle";
  private error: string | null = null;
  private raf = 0;
  private listeners = new Set<() => void>();
  private snap: PlayerSnapshot;
  private lastEmit = 0;
  onEnded: (() => void) | null = null;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = "anonymous";
    this.audio.preload = "auto";
    this.audio.addEventListener("waiting", () => this.setStatus("loading"));
    this.audio.addEventListener("playing", () => this.setStatus("playing"));
    this.audio.addEventListener("error", () => this.fail("تعذّر تحميل التلاوة — تحقق من الاتصال أو اختر قارئاً آخر"));
    this.snap = this.compute();
  }

  load(items: TimelineItem[], startIndex = 0) {
    this.pause();
    this.items = items;
    this.index = Math.max(0, Math.min(startIndex, items.length - 1));
    this.error = null;
    this.status = "idle";
    this.emit(true);
  }

  private setStatus(s: PlayerStatus) {
    this.status = s;
    this.emit(true);
  }

  private fail(msg: string) {
    this.error = msg;
    this.status = "error";
    cancelAnimationFrame(this.raf);
    this.emit(true);
  }

  private async seekInto(index: number, ms: number) {
    const item = this.items[index];
    if (!item) return;
    this.index = index;
    const abs = new URL(item.url, location.href).href;
    if (this.audio.src !== abs) {
      this.audio.src = abs;
      this.status = "loading";
      this.emit(true);
      await new Promise<void>((res, rej) => {
        const ok = () => { cleanup(); res(); };
        const bad = () => { cleanup(); rej(new Error("load")); };
        const cleanup = () => { this.audio.removeEventListener("loadedmetadata", ok); this.audio.removeEventListener("error", bad); };
        this.audio.addEventListener("loadedmetadata", ok);
        this.audio.addEventListener("error", bad);
      });
    }
    this.audio.currentTime = ms / 1000;
  }

  async play(fromIndex?: number) {
    if (!this.items.length) return;
    try {
      if (fromIndex !== undefined || this.status === "idle" || this.status === "ended" || this.status === "error") {
        const i = fromIndex ?? (this.status === "ended" || this.status === "error" ? 0 : this.index);
        this.error = null;
        await this.seekInto(i, this.items[i].startMs);
      }
      await this.audio.play();
      this.status = "playing";
      this.tick();
      this.emit(true);
    } catch (e) {
      if ((e as Error)?.name === "NotAllowedError") this.fail("اضغط تشغيل للسماح بالصوت");
      else if ((e as Error)?.name !== "AbortError") this.fail("تعذّر تشغيل التلاوة — تحقق من الاتصال أو اختر قارئاً آخر");
    }
  }

  pause() {
    cancelAnimationFrame(this.raf);
    if (!this.audio.paused) this.audio.pause();
    if (this.status === "playing" || this.status === "loading") this.status = "paused";
    this.emit(true);
  }

  toggle() {
    if (this.status === "playing" || this.status === "loading") this.pause();
    else void this.play();
  }

  async seekGlobal(ms: number) {
    let acc = 0;
    for (let i = 0; i < this.items.length; i++) {
      const d = this.items[i].endMs - this.items[i].startMs;
      if (ms < acc + d || i === this.items.length - 1) {
        const wasPlaying = this.status === "playing";
        try {
          await this.seekInto(i, this.items[i].startMs + Math.max(0, Math.min(d - 1, ms - acc)));
        } catch {
          this.fail("تعذّر تحميل التلاوة");
          return;
        }
        if (wasPlaying) void this.audio.play().catch(() => undefined);
        else if (this.status === "idle" || this.status === "ended") this.status = "paused";
        this.emit(true);
        return;
      }
      acc += d;
    }
  }

  jump(delta: number) {
    const i = this.index + delta;
    if (i < 0 || i >= this.items.length) return;
    void this.play(i);
  }

  setRate(r: number) {
    this.audio.playbackRate = r;
    this.emit(true);
  }

  private tick = () => {
    const item = this.items[this.index];
    if (item && !this.audio.paused) {
      const ms = this.audio.currentTime * 1000;
      if (ms >= item.endMs - 15 || this.audio.ended) {
        const next = this.items[this.index + 1];
        if (!next) {
          this.audio.pause();
          this.status = "ended";
          this.emit(true);
          this.onEnded?.();
          return;
        }
        if (next.url === item.url && Math.abs(next.startMs - item.endMs) < 400) this.index += 1;
        else void this.play(this.index + 1);
      }
    }
    this.emit(false);
    this.raf = requestAnimationFrame(this.tick);
  };

  private compute(): PlayerSnapshot {
    const item = this.items[this.index];
    const itemMs = this.audio.currentTime * 1000;
    let before = 0;
    for (let i = 0; i < this.index; i++) before += this.items[i].endMs - this.items[i].startMs;
    const inItem = item ? Math.max(0, Math.min(item.endMs - item.startMs, itemMs - item.startMs)) : 0;
    return {
      status: this.status, index: this.index, verseKey: item?.verseKey ?? null, itemMs,
      globalMs: this.status === "idle" ? 0 : before + inItem, totalMs: timelineDuration(this.items),
      activeWord: this.status === "idle" ? null : activeWordAt(item, itemMs), error: this.error, rate: this.audio.playbackRate,
    };
  }

  /** Fresh, un-throttled state for render loops (canvas). */
  frame(): PlayerSnapshot {
    return this.compute();
  }

  private emit(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.snap = this.compute();
    this.listeners.forEach((l) => l());
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = () => this.snap;

  destroy() {
    this.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.listeners.clear();
  }
}

export const usePlayer = (p: RecitationPlayer) => useSyncExternalStore(p.subscribe, p.getSnapshot);

/** Shared player for the Quran section (reader, discovery, favorites). */
export const quranPlayer = new RecitationPlayer();
