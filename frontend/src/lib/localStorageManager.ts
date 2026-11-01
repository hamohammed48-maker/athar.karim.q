import { idbClear, idbDelete, idbGet, idbGetAll, idbPut, STORES, type StoreName } from "@/lib/persistence/idb";
type StoredRow = Record<string, unknown> & { id?: string; key?: string };
type ChapterIndex = { id: "chapters:index"; chapters: Array<{ id: number }> };
export interface LocalStorageItem { store: StoreName; key: string; label: string; category: string; size: number; detail?: string; }
function estimateRecordBytes(value: unknown): number {
  let binaryBytes = 0;
  const json = JSON.stringify(value, (_key, item: unknown) => {
    if (typeof Blob !== "undefined" && item instanceof Blob) { binaryBytes += item.size; return { __blobBytes: item.size }; }
    if (item instanceof ArrayBuffer) { binaryBytes += item.byteLength; return { __bufferBytes: item.byteLength }; }
    if (ArrayBuffer.isView(item)) { binaryBytes += item.byteLength; return { __viewBytes: item.byteLength }; }
    return item;
  }) ?? "";
  return new TextEncoder().encode(json).byteLength + binaryBytes;
}
function describe(store: StoreName, row: StoredRow): Omit<LocalStorageItem, "store" | "key" | "size"> {
  if (store === "offline-content") {
    const id = String(row.id ?? "");
    if (id.startsWith("chapter:")) {
      const chapter = (row.data as { chapter?: { name_arabic?: string } } | undefined)?.chapter;
      return { label: chapter?.name_arabic ? `سورة ${chapter.name_arabic}` : `السورة رقم ${row.chapterId ?? id.slice(8)}`, category: "نصوص القرآن", detail: "نص السورة والآيات والترجمة" };
    }
    const labels: Record<string, string> = { "chapters:index": "فهرس السور", "topics:index": "فهرس الموضوعات", "reciters:index": "قائمة القرّاء" };
    return { label: labels[id] ?? String(row.name ?? row.title ?? id ?? "بيانات محفوظة"), category: labels[id] ? "بيانات الفهرس" : "بيانات أخرى" };
  }
  if (store === "media" && row.kind === "quran-audio") return { label: `سورة ${String(row.chapterName ?? row.chapterId ?? "")}`, category: "التلاوات الصوتية", detail: `القارئ: ${String(row.reciterName ?? row.reciterId ?? "غير معروف")}` };
  if (store === "media") return { label: String(row.name ?? row.title ?? row.fileName ?? row.id ?? "ملف وسائط"), category: "ملفات الوسائط والمشاريع", detail: String(row.kind ?? "ملف محفوظ") };
  if (store === "favorites") return { label: String(row.title ?? row.name ?? row.key ?? "عنصر مفضّل"), category: "المفضلة", detail: String(row.type ?? "عنصر محفوظ") };
  if (store === "templates") return { label: String(row.name ?? row.title ?? row.id ?? "قالب محفوظ"), category: "القوالب" };
  return { label: String(row.name ?? row.title ?? row.id ?? "مشروع محفوظ"), category: "المشاريع" };
}
export async function getLocalStorageInventory(): Promise<{ items: LocalStorageItem[]; totalBytes: number }> {
  const items: LocalStorageItem[] = [];
  for (const store of STORES) for (const row of await idbGetAll<StoredRow>(store)) {
    const key = store === "favorites" ? row.key : row.id;
    if (typeof key === "string" && key) items.push({ store, key, ...describe(store, row), size: estimateRecordBytes(row) });
  }
  items.sort((a, b) => a.category.localeCompare(b.category, "ar") || a.label.localeCompare(b.label, "ar"));
  return { items, totalBytes: items.reduce((sum, item) => sum + item.size, 0) };
}
export async function deleteLocalStorageItem(item: Pick<LocalStorageItem, "store" | "key">): Promise<void> {
  await idbDelete(item.store, item.key);
  if (item.store === "offline-content" && item.key.startsWith("chapter:")) {
    const index = await idbGet<ChapterIndex>("offline-content", "chapters:index");
    if (index?.chapters) {
      const chapterId = Number(item.key.slice(8));
      await idbPut("offline-content", { ...index, chapters: index.chapters.filter((chapter) => chapter.id !== chapterId) });
    }
  }
}
export async function clearAllLocalStorageData(): Promise<void> { await Promise.all(STORES.map((store) => idbClear(store))); }
