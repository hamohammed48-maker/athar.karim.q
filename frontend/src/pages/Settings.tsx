import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Info, ShieldCheck, Download, RefreshCw, Smartphone, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, RangeField, Segmented, ToggleRow } from "@/components/shared/ui-kit";
import { checkOfflineQuranIntegrity } from "@/lib/offlineChapters";
import { Link } from "react-router-dom";

import { useReciters } from "@/lib/quran/hooks";
import { formatBytes, toArabicDigits } from "@/lib/quran/format";
import { ASPECTS, RESOLUTIONS, type AspectRatio, type Resolution } from "@/lib/rendering/design";
import { DEFAULT_SETTINGS, updateSettings, useSettings } from "@/lib/settings";
import { APP_VERSION, checkAppUpdate, downloadAndInstallUpdate, type AvailableUpdate } from "@/lib/appUpdater";

export default function SettingsPage() {
  const s = useSettings();
  const [availableUpdate, setAvailableUpdate] = useState<AvailableUpdate | null>(() => {
    try { return JSON.parse(localStorage.getItem("athar.appUpdate.available.v1") || "null") as AvailableUpdate | null; }
    catch { return null; }
  });
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "current" | "available" | "downloading" | "permission" | "installer" | "error">("idle");
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateMessage, setUpdateMessage] = useState("");

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    setUpdateMessage("");
    try {
      const latest = await checkAppUpdate();
      setAvailableUpdate(latest);
      localStorage.setItem("athar.appUpdate.available.v1", JSON.stringify(latest));
      setUpdateStatus(latest ? "available" : "current");
      if (!latest) setUpdateMessage("أنت تستخدم أحدث إصدار متاح.");
    } catch (error) {
      setUpdateStatus("error");
      setUpdateMessage(error instanceof Error ? error.message : "تعذّر التحقق من التحديث.");
    }
  };

  const handleInstallUpdate = async () => {
    if (!availableUpdate) return;
    setUpdateStatus("downloading");
    setDownloadProgress(0);
    setUpdateMessage("");
    try {
      const result = await downloadAndInstallUpdate(availableUpdate, setDownloadProgress);
      if (result === "permission-required") {
        setUpdateStatus("permission");
        setUpdateMessage("فعّل السماح بتثبيت التطبيقات من هذا المصدر، ثم ارجع واضغط تثبيت التحديث مرة أخرى.");
      } else {
        setUpdateStatus("installer");
        setUpdateMessage("اكتمل التنزيل. أكّد التحديث في نافذة أندرويد.");
      }
    } catch (error) {
      setUpdateStatus("error");
      setUpdateMessage(error instanceof Error ? error.message : "تعذّر تنزيل التحديث.");
    }
  };

  useEffect(() => {
    const onAvailable = (event: Event) => {
      const detail = (event as CustomEvent<AvailableUpdate | null>).detail;
      setAvailableUpdate(detail);
      setUpdateStatus(detail ? "available" : "current");
      try { localStorage.setItem("athar.appUpdate.available.v1", JSON.stringify(detail)); } catch { /* ignore */ }
    };
    window.addEventListener("athar-app-update", onAvailable);
    void handleCheckUpdate();
    return () => window.removeEventListener("athar-app-update", onAvailable);
  }, []);
  const { data: reciters } = useReciters();
  const usage = useQuery({ queryKey: ["storage-estimate"], queryFn: () => navigator.storage?.estimate?.() ?? Promise.resolve(null) });
  const integrity = useQuery({ queryKey: ["integrity", "local"], queryFn: checkOfflineQuranIntegrity, enabled: false });

  const card = "space-y-4 rounded-2xl border border-line bg-navy-900 p-5";
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 pt-8 sm:px-6">
      <PageHeader title="الإعدادات" subtitle="تُحفظ الإعدادات على هذا الجهاز." />
      <section className={card} id="app-update">
        <h2 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4 text-gold" /> تحديث التطبيق</h2>
        <p className="text-sm text-ink-soft">الإصدار المثبت: {APP_VERSION}</p>
        {availableUpdate && (
          <div className="space-y-2 rounded-xl border border-gold/30 bg-navy-800 p-3">
            <p className="font-semibold text-gold">يتوفر إصدار جديد: {availableUpdate.version}</p>
            {availableUpdate.notes && <p className="whitespace-pre-wrap text-sm text-ink-soft">{availableUpdate.notes}</p>}
            <p className="text-xs text-ink-muted">حجم الملف: {formatBytes(availableUpdate.size)}</p>
          </div>
        )}
        {updateStatus === "downloading" && (
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-navy-700"><div className="h-full rounded-full bg-gold transition-all" style={{ width: downloadProgress + "%" }} /></div>
            <p className="text-sm text-ink-soft">جارٍ تنزيل التحديث: {toArabicDigits(downloadProgress)}٪</p>
          </div>
        )}
        {updateMessage && <p className={updateStatus === "error" ? "text-sm text-danger" : "text-sm text-ink-soft"}>{updateMessage}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void handleCheckUpdate()} disabled={updateStatus === "checking" || updateStatus === "downloading"}>
            <RefreshCw className="me-2 size-4" /> {updateStatus === "checking" ? "جارٍ التحقق…" : "التحقق من التحديث"}
          </Button>
          {availableUpdate && (
            <Button onClick={() => void handleInstallUpdate()} disabled={updateStatus === "downloading"}>
              <Download className="me-2 size-4" /> {updateStatus === "permission" ? "إعادة محاولة التثبيت" : "تنزيل وتثبيت التحديث"}
            </Button>
          )}
        </div>
        <p className="text-xs text-ink-muted">يتحقق التطبيق من التحديثات عند فتحه. عند توفر إصدار جديد، نزّله من هنا؛ سيطلب أندرويد تأكيد التثبيت. لا تُحذف بيانات السور والقوالب عند التحديث.</p>
      </section>
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
      <section className={card} id="local-storage">
        <div className="flex items-center gap-3">
          <Database className="size-5 shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">بيانات التخزين المحلي</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {usage.data ? `المستخدم: ${formatBytes(usage.data.usage ?? 0)} · المساحة التي يتيحها النظام: ${formatBytes(usage.data.quota ?? 0)}` : "بياناتك المحفوظة داخل التطبيق على هذا الجهاز."}
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-muted">اعرض السور والتلاوات والملفات والمشاريع المحفوظة، وتحكّم بكل عنصر بشكل مستقل.</p>
        <Button asChild className="w-full" data-testid="settings-open-storage">
          <Link to="/storage"><FolderOpen className="me-2 size-4" /> دخول إلى البيانات المحمّلة</Link>
        </Button>
      </section>
      <section className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-gold" /> سلامة بيانات القرآن</h2>
        <p className="text-sm text-ink-soft">فحص اكتمال النص والترجمة وتسلسل الآيات في السور المحفوظة داخل التطبيق، دون الحاجة إلى الإنترنت.</p>
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
          <li>التلاوات تُشغّل عبر الإنترنت عند الطلب، ويمكن تنزيل صوت كل سورة لقارئ محدد للاستماع إليها دون إنترنت.</li>
          <li>تصدير الفيديو يتم داخل متصفحك بالكامل؛ لا تُرفع ملفاتك إلى أي خادم.</li>
          <li>تصنيف المواضيع مختارات تحريرية وليس تفسيراً.</li>
        </ul>
      </section>
    </div>
  );
}
