import { useSyncExternalStore } from "react";
import type { AspectRatio, Resolution } from "@/lib/rendering/design";

// Small user preferences only (no media) — localStorage is appropriate here.
export interface AppSettings {
  quranFontSize: number;
  reciterId: number;
  showTranslation: boolean;
  readerWordHighlight: boolean;
  defaultAspect: AspectRatio;
  defaultResolution: Resolution;
  defaultWatermark: boolean;
}

const KEY = "athar.settings.v1";
export const DEFAULT_SETTINGS: AppSettings = {
  quranFontSize: 30,
  reciterId: 7,
  showTranslation: false,
  readerWordHighlight: true,
  defaultAspect: "9:16",
  defaultResolution: "1080p",
  defaultWatermark: true,
};

const listeners = new Set<() => void>();
let current: AppSettings = load();

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettings() {
  return current;
}

export function updateSettings(patch: Partial<AppSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

// Last reading position ("continue reading")
const POS_KEY = "athar.lastRead.v1";
export interface ReadPosition { chapter: number; verse: number; name: string; at: number }
export const saveReadPosition = (p: ReadPosition) => {
  try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
};
export const getReadPosition = (): ReadPosition | null => {
  try { const r = localStorage.getItem(POS_KEY); return r ? (JSON.parse(r) as ReadPosition) : null; } catch { return null; }
};
