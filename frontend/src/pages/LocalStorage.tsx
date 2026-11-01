import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Database, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/ui-kit";
import { deleteLocalStorageItem, getLocalStorageInventory, type LocalStorageItem } from "@/lib/localStorageManager";
import { formatBytes, toArabicDigits } from "@/lib/quran/format";

export default function LocalStoragePage() {
  const qc = useQueryClient();
  const inventory = useQuery({
    queryKey: ["local-storage-inventory"],
    queryFn: getLocalStorageInventory,
    staleTime: 0,
  });

  const removeItem = async (item: LocalStorageItem) => {
    if (!confirm(`حذف "${item.label}" من التخزين المحلي؟ لن يتأثر أي عنصر آخر.`)) return;
    await deleteLocalStorageItem(item);
    if (item.store === "offline-content" && item.key.startsWith("chapter:")) {
      qc.removeQueries({ queryKey: ["chapter", Number(item.key.slice(8))] });
    }
    if (item.store === "media" && item.key.startsWith("quran-audio:")) {
      const [, reciterId, chapterId] = item.key.split(":");
      qc.removeQueries({ queryKey: ["audio", Number(reciterId), Number(chapterId)] });
    }
    await inventory.refetch();
    qc.invalidateQueries({ queryKey: ["idb"] });
  };

  const items = inventory.data?.items ?? [];
  const categories = [...new Set(items.map((item) => item.category))];

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 pb-28 sm:px-6">
      <div className="flex items-center gap-3">
        <Button render={<Link to="/settings" />} variant="ghost" size="icon" aria-label="العودة إلى الإعدادات">
          <ArrowRight className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <PageHeader title="البيانات المحمّلة" subtitle="الملفات والبيانات المحفوظة على هذا الجهاز." />
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-line bg-navy-900 p-5">
        <div className="flex items-center gap-2">
          <Database className="size-5 text-gold" />
          <h2 className="font-semibold">ملخص التخزين المحلي</h2>
        </div>
        {inventory.data ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-navy-800 p-3">
              <p className="text-xs text-ink-muted">إجمالي الحجم</p>
              <p className="mt-1 text-lg font-semibold">{formatBytes(inventory.data.totalBytes)}</p>
            </div>
            <div className="rounded-xl bg-navy-800 p-3">
              <p className="text-xs text-ink-muted">عدد العناصر</p>
              <p className="mt-1 text-lg font-semibold">{toArabicDigits(items.length)}</p>
            </div>
          </div>
        ) : <p className="text-sm text-ink-soft">جارٍ قراءة البيانات المحفوظة…</p>}
        <Button variant="outline" className="w-full" onClick={() => void inventory.refetch()} disabled={inventory.isFetching}>
          <RefreshCw className="me-2 size-4" /> تحديث قائمة البيانات
        </Button>
      </section>

      {inventory.isError && <p className="rounded-xl border border-danger/30 p-4 text-sm text-danger">تعذّر قراءة بيانات التخزين المحلي.</p>}
      {inventory.isLoading && <p className="text-center text-sm text-ink-soft">جارٍ فحص البيانات المحفوظة…</p>}
      {inventory.data && items.length === 0 && (
        <div className="rounded-2xl border border-line bg-navy-900 p-6 text-center text-sm text-ink-soft">
          لا توجد بيانات محمّلة أو ملفات محفوظة حالياً على هذا الجهاز.
        </div>
      )}

      {categories.map((category) => {
        const group = items.filter((item) => item.category === category);
        const size = group.reduce((sum, item) => sum + item.size, 0);
        return (
          <section key={category} className="space-y-3 rounded-2xl border border-line bg-navy-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{category}</h2>
              <span className="shrink-0 text-xs text-ink-muted">{formatBytes(size)} · {toArabicDigits(group.length)} عنصر</span>
            </div>
            {group.map((item) => (
              <div key={item.store + ":" + item.key} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-navy-800 p-3" data-testid="local-storage-item">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-semibold">{item.label}</p>
                  {item.detail && <p className="truncate text-xs text-ink-soft">{item.detail}</p>}
                  <p className="text-xs text-ink-muted">{formatBytes(item.size)}</p>
                </div>
                <Button variant="ghost" size="icon" aria-label={`حذف ${item.label}`} onClick={() => void removeItem(item)} data-testid="local-storage-delete-item">
                  <Trash2 className="size-4 text-danger" />
                </Button>
              </div>
            ))}
          </section>
        );
      })}
      <p className="px-1 text-xs leading-6 text-ink-muted">حذف عنصر واحد لا يؤثر على بقية البيانات. حذف التلاوة لا يحذف نص السورة، ويمكنك الرجوع إلى الإعدادات دون فقدان أي بيانات.</p>
    </div>
  );
}
