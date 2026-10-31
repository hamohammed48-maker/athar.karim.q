import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, RangeField, Segmented, ToggleRow } from "@/components/shared/ui-kit";
import { apiGet } from "@/lib/api";
import { idbClear } from "@/lib/persistence/idb";
import { useReciters } from "@/lib/quran/hooks";
import { formatBytes, toArabicDigits } from "@/lib/quran/format";
import { ASPECTS, RESOLUTIONS, type AspectRatio, type Resolution } from "@/lib/rendering/design";
import { DEFAULT_SETTINGS, updateSettings, useSettings } from "@/lib/settings";
import type { IntegrityReport } from "@/types/quran";

export default function SettingsPage() {
  const s = useSettings();
  const qc = useQueryClient();
  const { data: reciters } = useReciters();
  const usage = useQuery({ queryKey: ["storage-estimate"], queryFn: () => navigator.storage?.estimate?.() ?? Promise.resolve(null) });
  const integrity = useQuery({ queryKey: ["integrity"], queryFn: () => apiGet<IntegrityReport>("/quran/integrity"), enabled: false });

  const clearAll = async () => {
    if (!confirm("سيُحذف كل المحفوظ على هذا الجهاز: المفضلة والنماذج والمشاريع والخلفيات. متابعة؟")) return;
    await Promise.all((["favorites", "templates", "projects", "media"] as const).map((x) => idbClear(x)));
    qc.invalidateQueries({ queryKey: ["idb"] });
    void usage.refetch();
    toast.success("حُذفت البيانات المحلية");
  };

  const card = "space-y-4 rounded-2xl border border-line bg-navy-900 p-5";
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 sm:px-6">
      <PageHeader title="الإعدادات" subtitle="تُحفظ الإعدادات على هذا الجهاز." />
      <section className={card}>
        <h2 className="font-semibold">المظهر</h2>
        <p className="text-sm text-ink-soft" data-testid="settings-theme-display">الوضع الداكن (الإصدار الحالي يدعم الوضع الداكن فقط). لغة الواجهة: العربية.</p>
      </section>
      <section className={card}>
        <h2 className="font-semibold">القراءة والاستماع</h2>
        <label className="block space-y-2">
          <span className="text-sm text-ink-soft">القارئ الافتراضي</span>
          <Select value={String(s.reciterId)} onValueChange={(v: string) => updateSettings({ reciterId: Number(v) })}>
            <SelectTrigger className="h-11 w-full" data-testid="settings-default-reciter-select"><SelectValue>{(v) => reciters?.find((r) => String(r.id) === v)?.name ?? "…"}</SelectValue></SelectTrigger>
            <SelectContent>{reciters?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name} — {r.style}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <RangeField label="حجم خط المصحف" value={s.quranFontSize} min={20} max={56} step={2} onChange={(v) => updateSettings({ quranFontSize: v })} testId="settings-font-size" />
        <p className="quran-text text-ink" style={{ fontSize: s.quranFontSize }}>ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ</p>
        <ToggleRow label="إظهار الترجمة في القارئ" hint="Saheeh International" checked={s.showTranslation} onChange={(v) => updateSettings({ showTranslation: v })} testId="settings-translation-toggle" />
        <ToggleRow label="تتبع الكلمات في القارئ" checked={s.readerWordHighlight} onChange={(v) => updateSettings({ readerWordHighlight: v })} testId="settings-word-highlight-toggle" />
      </section>
      <section className={card}>
        <h2 className="font-semibold">الاستوديو (للمشاريع الجديدة)</h2>
        <div className="space-y-2"><span className="text-sm text-ink-soft">الأبعاد الافتراضية</span>
          <Segmented<AspectRatio> value={s.defaultAspect} onChange={(v) => updateSettings({ defaultAspect: v })} testId="settings-aspect" label="الأبعاد" options={ASPECTS.map((a) => ({ id: a.id, label: a.label }))} /></div>
        <div className="space-y-2"><span className="text-sm text-ink-soft">دقة التصدير الافتراضية</span>
          <Segmented<Resolution> value={s.defaultResolution} onChange={(v) => updateSettings({ defaultResolution: v })} testId="settings-resolution" label="الدقة" options={RESOLUTIONS.map((r) => ({ id: r.id, label: r.label }))} /></div>
        <ToggleRow label="العلامة المائية مفعّلة افتراضياً" checked={s.defaultWatermark} onChange={(v) => updateSettings({ defaultWatermark: v })} testId="settings-watermark-toggle" />
        <Button variant="ghost" onClick={() => updateSettings(DEFAULT_SETTINGS)} data-testid="settings-reset">استعادة الإعدادات الافتراضية</Button>
      </section>
      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><Database className="size-4 text-gold" /> التخزين المحلي</h2>
        <p className="text-sm text-ink-soft" data-testid="settings-storage-usage">
          {usage.data ? `المستخدم: ${formatBytes(usage.data.usage ?? 0)} من ${formatBytes(usage.data.quota ?? 0)} متاحة للمتصفح` : "المتصفح لا يوفّر تقدير مساحة التخزين."}
        </p>
        <p className="text-xs text-ink-muted">المفضلة والنماذج والمشاريع والخلفيات محفوظة في IndexedDB على هذا المتصفح فقط، ولا تُزامن مع أجهزة أخرى. يمكنك تصدير النماذج من «نماذجي المحفوظة».</p>
        <Button variant="destructive" onClick={clearAll} data-testid="settings-clear-data">حذف كل البيانات المحلية</Button>
      </section>
      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-gold" /> سلامة بيانات القرآن</h2>
        <p className="text-sm text-ink-soft">فحص عدد السور (١١٤) والآيات (٦٢٣٦) والتسلسل والتكرار والنصوص الفارغة في النسخة المخزنة من Quran.com.</p>
        <Button variant="outline" onClick={() => void integrity.refetch()} disabled={integrity.isFetching} data-testid="settings-integrity-run">{integrity.isFetching ? "جارٍ الفحص…" : "تشغيل الفحص"}</Button>
        {integrity.data && (
          <div className="rounded-xl bg-navy-800 p-3 text-sm" data-testid="settings-integrity-result">
            <p className={integrity.data.ok ? "text-success" : "text-warning"}>{integrity.data.ok ? "✓ اجتاز البيانات كل الفحوص" : "توجد ملاحظات:"}</p>
            <p>السور: {toArabicDigits(integrity.data.chapters_count)} / {toArabicDigits(integrity.data.expected_chapters)} — الآيات المخزنة: {toArabicDigits(integrity.data.verses_count)} / {toArabicDigits(integrity.data.expected_verses)}</p>
            {integrity.data.issues.map((i) => <p key={i} className="text-xs text-warning">• {i}</p>)}
            <p className="mt-1 text-xs text-ink-muted">{integrity.data.source}</p>
          </div>
        )}
        {integrity.isError && <p className="text-sm text-danger">تعذّر تشغيل الفحص.</p>}
      </section>
      <section className={card} id="about">
        <h2 className="flex items-center gap-2 font-semibold"><Info className="size-4 text-gold" /> حول التطبيق</h2>
        <p className="font-quran text-2xl text-gold">أثر كريم — آياتٌ تُتلى، وأثرٌ يبقى.</p>
        <ul className="list-disc space-y-1 ps-5 text-sm text-ink-soft">
          <li>نص القرآن (الرسم العثماني) والترجمة وبيانات التلاوات وتوقيت الكلمات: Quran.com / Quran Foundation.</li>
          <li>الترجمة الإنجليزية: Saheeh International.</li>
          <li>الملفات الصوتية تُشغّل مباشرة من download.quranicaudio.com عند الطلب، وتتطلب اتصالاً بالإنترنت.</li>
          <li>تصدير الفيديو يتم داخل متصفحك بالكامل؛ لا تُرفع ملفاتك إلى أي خادم.</li>
          <li>تصنيف المواضيع مختارات تحريرية وليس تفسيراً.</li>
        </ul>
        <a href="/api/download/project" download="athar-kareem.zip" className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm hover:bg-navy-800" data-testid="settings-download-source">
          تنزيل ملفات المشروع (ZIP)
        </a>
      </section>
    </div>
  );
}
