import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { idbDelete, idbGet, idbGetAll, idbPut, StorageError } from "@/lib/persistence/idb";
import type { DesignSettings } from "@/lib/rendering/design";
import type { Verse } from "@/types/quran";

export interface Favorite { key: string; chapter: number; number: number; text: string; surahName: string; addedAt: number }
export interface SavedTemplate {
  id: string; name: string; design: DesignSettings; thumbnail: string | null;
  includesMedia: boolean; createdAt: number; updatedAt: number;
}
export interface StudioProject {
  id: string; name: string; verseKeys: string[]; reciterId: number; design: DesignSettings;
  thumbnail: string | null; createdAt: number; updatedAt: number;
}
export interface MediaRecord { id: string; blob: Blob; type: string; name: string; size: number; createdAt: number }

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

const sortByUpdated = <T extends { updatedAt: number }>(a: T[]) => [...a].sort((x, y) => y.updatedAt - x.updatedAt);

export const storageErrorMessage = (e: unknown) =>
  e instanceof StorageError ? e.message : "تعذّر الحفظ في التخزين المحلي";

// ---------- favorites ----------
export const useFavorites = () =>
  useQuery({
    queryKey: ["idb", "favorites"],
    queryFn: async () => (await idbGetAll<Favorite>("favorites")).sort((a, b) => b.addedAt - a.addedAt),
  });

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ verse, surahName }: { verse: Verse; surahName: string }) => {
      const existing = await idbGet<Favorite>("favorites", verse.key);
      if (existing) {
        await idbDelete("favorites", verse.key);
        return false;
      }
      await idbPut<Favorite>("favorites", {
        key: verse.key, chapter: verse.chapter, number: verse.number, text: verse.text, surahName, addedAt: Date.now(),
      });
      return true;
    },
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ["idb", "favorites"] });
      toast.success(added ? "أُضيفت الآية إلى المفضلة" : "أُزيلت الآية من المفضلة");
    },
    onError: (e) => toast.error(storageErrorMessage(e)),
  });
}

export function useRemoveFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => idbDelete("favorites", key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idb", "favorites"] }),
  });
}

// ---------- templates ----------
export const useSavedTemplates = () =>
  useQuery({ queryKey: ["idb", "templates"], queryFn: async () => sortByUpdated(await idbGetAll<SavedTemplate>("templates")) });

export const getTemplate = (id: string) => idbGet<SavedTemplate>("templates", id);

export function useTemplateMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["idb", "templates"] });
  const onError = (e: unknown) => toast.error(storageErrorMessage(e));
  const save = useMutation({ mutationFn: (t: SavedTemplate) => idbPut("templates", t), onSuccess: done, onError });
  const remove = useMutation({ mutationFn: (id: string) => idbDelete("templates", id), onSuccess: done, onError });
  return { save, remove };
}

// ---------- projects ----------
export const useProjects = () =>
  useQuery({ queryKey: ["idb", "projects"], queryFn: async () => sortByUpdated(await idbGetAll<StudioProject>("projects")) });

export const getProject = (id: string) => idbGet<StudioProject>("projects", id);
export const putProject = (p: StudioProject) => idbPut("projects", p);

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => idbDelete("projects", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["idb", "projects"] }),
  });
}

// ---------- media (user backgrounds; stays on this device) ----------
const memoryMedia = new Map<string, MediaRecord>(); // session fallback when persistence fails

export async function storeMedia(file: File): Promise<{ id: string; persisted: boolean }> {
  const rec: MediaRecord = { id: uid(), blob: file, type: file.type, name: file.name, size: file.size, createdAt: Date.now() };
  memoryMedia.set(rec.id, rec);
  try {
    await idbPut("media", rec);
    return { id: rec.id, persisted: true };
  } catch (e) {
    toast.warning(`${storageErrorMessage(e)} — ستُستخدم الخلفية في هذه الجلسة فقط ولن تُستعاد بعد إعادة التحميل.`);
    return { id: rec.id, persisted: false };
  }
}

export async function loadMedia(id: string): Promise<MediaRecord | undefined> {
  return memoryMedia.get(id) ?? (await idbGet<MediaRecord>("media", id).catch(() => undefined));
}
