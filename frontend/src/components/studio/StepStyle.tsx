import { useState } from "react";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColorField, RangeField, Segmented, ToggleRow } from "@/components/shared/ui-kit";
import { QURAN_FONTS, TEXT_SWATCHES, type DesignSettings } from "@/lib/rendering/design";

type Tab = "text" | "shadow" | "tracking" | "translation" | "watermark" | "effects";
interface Props {
  design: DesignSettings;
  setDesign: (fn: (d: DesignSettings) => DesignSettings) => void;
  defaults: DesignSettings; // template defaults for "reset"
  wordTiming: boolean | null; // null = unknown yet
  onNext: () => void;
}

export function StepStyle({ design, setDesign, defaults, wordTiming, onNext }: Props) {
  const [tab, setTab] = useState<Tab>("text");
  const set = <K extends keyof DesignSettings>(k: K, patch: Partial<DesignSettings[K]>) =>
    setDesign((d) => ({ ...d, [k]: { ...(d[k] as object), ...patch } }));
  const t = design.text, s = design.shadow, tr = design.tracking, tl = design.translation, w = design.watermark, v = design.visualizer;

  return (
    <div className="space-y-6" data-testid="studio-step-style">
      <Segmented<Tab> value={tab} onChange={setTab} testId="studio-style-tabs" label="أقسام التخصيص"
        options={[{ id: "text", label: "النص" }, { id: "shadow", label: "الظل" }, { id: "tracking", label: "تتبع الكلمات" }, { id: "translation", label: "الترجمة" }, { id: "watermark", label: "العلامة المائية" }, { id: "effects", label: "المؤثرات" }]} />
      <div className="space-y-5 rounded-2xl border border-line bg-navy-900 p-4">
        {tab === "text" && (
          <>
            <label className="block space-y-2">
              <span className="text-sm text-ink-soft">الخط القرآني</span>
              <Select value={t.fontFamily} onValueChange={(f: string) => set("text", { fontFamily: f })}>
                <SelectTrigger className="h-11 w-full" data-testid="studio-font-select"><SelectValue>{(val) => QURAN_FONTS.find((f) => f.id === val)?.label ?? String(val)}</SelectValue></SelectTrigger>
                <SelectContent>{QURAN_FONTS.map((f) => <SelectItem key={f.id} value={f.id}><span style={{ fontFamily: f.id }} className="text-lg">{f.label} — بِسْمِ ٱللَّهِ</span></SelectItem>)}</SelectContent>
              </Select>
            </label>
            <RangeField label="حجم الخط" value={t.fontSize} min={28} max={120} onChange={(x) => set("text", { fontSize: x })} testId="studio-font-size-slider" />
            <ColorField label="لون النص" value={t.color} swatches={TEXT_SWATCHES} onChange={(c) => set("text", { color: c })} testId="studio-text-color" onReset={() => set("text", { color: defaults.text.color })} />
            <ColorField label="لون رقم الآية والمرجع" value={t.referenceColor} swatches={TEXT_SWATCHES.slice(0, 5)} onChange={(c) => set("text", { referenceColor: c })} testId="studio-ref-color" />
            <div className="space-y-2"><span className="text-sm text-ink-soft">المحاذاة</span>
              <Segmented value={t.align} onChange={(x) => set("text", { align: x })} testId="studio-text-align" label="المحاذاة" options={[{ id: "right", label: "يمين" }, { id: "center", label: "وسط" }, { id: "left", label: "يسار" }]} /></div>
            <div className="space-y-2"><span className="text-sm text-ink-soft">موضع النص</span>
              <Segmented value={t.position} onChange={(x) => set("text", { position: x })} testId="studio-text-position" label="موضع النص" options={[{ id: "top", label: "أعلى" }, { id: "center", label: "وسط" }, { id: "bottom", label: "أسفل" }]} /></div>
            <RangeField label="ضبط دقيق للموضع" value={t.offsetY} min={-20} max={20} onChange={(x) => set("text", { offsetY: x })} testId="studio-text-offset" format={(x) => `${x}%`} />
            <RangeField label="تباعد الأسطر" value={t.lineHeight} min={1.4} max={2.6} step={0.1} onChange={(x) => set("text", { lineHeight: x })} testId="studio-line-height" format={(x) => x.toFixed(1)} />
            <RangeField label="أقصى عرض للنص" value={t.maxWidth} min={50} max={95} onChange={(x) => set("text", { maxWidth: x })} testId="studio-max-width" format={(x) => `${x}%`} />
            <ToggleRow label="إظهار رقم الآية" checked={t.showVerseNumber} onChange={(x) => set("text", { showVerseNumber: x })} testId="studio-show-verse-number" />
            <ToggleRow label="إظهار اسم السورة ورقم الآية" checked={t.showReference} onChange={(x) => set("text", { showReference: x })} testId="studio-show-reference" />
            <p className="text-xs text-ink-muted">يُلفّ النص تلقائياً، ويُصغَّر الخط عند الحاجة ليبقى داخل الإطار دون تشويه الحروف.</p>
          </>
        )}
        {tab === "shadow" && (
          <>
            <ToggleRow label="ظل النص" checked={s.enabled} onChange={(x) => set("shadow", { enabled: x })} testId="studio-shadow-toggle" />
            <ColorField label="لون الظل" value={s.color} swatches={["#000000", "#071827", "#2B1E12", "#E7B85C"]} onChange={(c) => set("shadow", { color: c })} testId="studio-shadow-color" />
            <RangeField label="قوة الظل" value={s.opacity} min={0} max={1} step={0.05} onChange={(x) => set("shadow", { opacity: x })} testId="studio-shadow-opacity" format={(x) => `${Math.round(x * 100)}%`} />
            <RangeField label="التمويه" value={s.blur} min={0} max={40} onChange={(x) => set("shadow", { blur: x })} testId="studio-shadow-blur" />
            <RangeField label="الإزاحة الأفقية" value={s.offsetX} min={-20} max={20} onChange={(x) => set("shadow", { offsetX: x })} testId="studio-shadow-offset-x" />
            <RangeField label="الإزاحة العمودية" value={s.offsetY} min={-20} max={20} onChange={(x) => set("shadow", { offsetY: x })} testId="studio-shadow-offset-y" />
          </>
        )}
        {tab === "tracking" && (
          <>
            <p className="flex items-start gap-2 rounded-xl bg-navy-800 p-3 text-sm" data-testid="studio-tracking-availability">
              <Info className="mt-0.5 size-4 shrink-0 text-gold" />
              {wordTiming === null ? "اختر الآيات والقارئ لمعرفة توفر توقيت الكلمات."
                : wordTiming ? "توقيت الكلمات متاح لهذه الآيات مع هذا القارئ (بيانات Quran.com) — يظهر التتبع في المعاينة والفيديو المصدَّر."
                : "لا تتوفر بيانات توقيت دقيقة لكل الكلمات مع هذا القارئ؛ سيُعرض الفيديو على مستوى الآية دون تتبع الكلمات."}
            </p>
            <ToggleRow label="تتبع الكلمات أثناء التلاوة" checked={tr.enabled} onChange={(x) => set("tracking", { enabled: x })} testId="studio-tracking-toggle" />
            <ColorField label="لون التمييز" value={tr.color} swatches={["#E7B85C", "#FDE68A", "#2563EB", "#10B981", "#F8FAFC"]} onChange={(c) => set("tracking", { color: c })} testId="studio-tracking-color" />
            <div className="space-y-2"><span className="text-sm text-ink-soft">نمط التمييز</span>
              <Segmented value={tr.style} onChange={(x) => set("tracking", { style: x })} testId="studio-tracking-style" label="نمط التمييز" options={[{ id: "color", label: "تلوين الكلمة" }, { id: "background", label: "خلفية" }, { id: "underline", label: "خط سفلي" }]} /></div>
            <ToggleRow label="تخفيف بقية الكلمات" checked={tr.dimOthers} onChange={(x) => set("tracking", { dimOthers: x })} testId="studio-tracking-dim" />
          </>
        )}
        {tab === "translation" && (
          <>
            <ToggleRow label="إظهار الترجمة" hint="Saheeh International (الإنجليزية) — عبر Quran.com" checked={tl.enabled} onChange={(x) => set("translation", { enabled: x })} testId="studio-translation-toggle" />
            <ColorField label="لون الترجمة" value={tl.color} swatches={TEXT_SWATCHES.slice(0, 6)} onChange={(c) => set("translation", { color: c })} testId="studio-translation-color" />
            <RangeField label="حجم الترجمة" value={tl.fontSize} min={16} max={60} onChange={(x) => set("translation", { fontSize: x })} testId="studio-translation-size" />
            <RangeField label="الشفافية" value={tl.opacity} min={0.3} max={1} step={0.05} onChange={(x) => set("translation", { opacity: x })} testId="studio-translation-opacity" format={(x) => `${Math.round(x * 100)}%`} />
          </>
        )}
        {tab === "watermark" && (
          <>
            <ToggleRow label="العلامة المائية «أثر كريم»" checked={w.enabled} onChange={(x) => set("watermark", { enabled: x })} testId="studio-watermark-toggle" />
            <div className="space-y-2"><span className="text-sm text-ink-soft">الموضع</span>
              <Segmented value={w.position} onChange={(x) => set("watermark", { position: x })} testId="studio-watermark-position" label="موضع العلامة"
                options={[{ id: "top-right", label: "أعلى اليمين" }, { id: "top-left", label: "أعلى اليسار" }, { id: "bottom-right", label: "أسفل اليمين" }, { id: "bottom-left", label: "أسفل اليسار" }]} /></div>
            <RangeField label="الحجم" value={w.size} min={18} max={80} onChange={(x) => set("watermark", { size: x })} testId="studio-watermark-size" />
            <RangeField label="الشفافية" value={w.opacity} min={0.2} max={1} step={0.05} onChange={(x) => set("watermark", { opacity: x })} testId="studio-watermark-opacity" format={(x) => `${Math.round(x * 100)}%`} />
          </>
        )}
        {tab === "effects" && (
          <>
            <ToggleRow label="مؤشر صوتي تفاعلي" hint="يتفاعل مع بيانات صوت التلاوة الفعلية أثناء التشغيل" checked={v.enabled} onChange={(x) => set("visualizer", { enabled: x })} testId="studio-visualizer-toggle" />
            <Segmented value={v.style} onChange={(x) => set("visualizer", { style: x })} testId="studio-visualizer-style" label="نمط المؤشر" options={[{ id: "bars", label: "أعمدة" }, { id: "wave", label: "موجة" }]} />
            <Segmented value={v.position} onChange={(x) => set("visualizer", { position: x })} testId="studio-visualizer-position" label="موضع المؤشر" options={[{ id: "top", label: "أعلى" }, { id: "bottom", label: "أسفل" }]} />
            <RangeField label="الارتفاع" value={v.size} min={30} max={160} onChange={(x) => set("visualizer", { size: x })} testId="studio-visualizer-size" />
            <ColorField label="لون المؤشر" value={v.color} swatches={["#E7B85C", "#2563EB", "#F8FAFC", "#10B981"]} onChange={(c) => set("visualizer", { color: c })} testId="studio-visualizer-color" />
            <div className="space-y-2"><span className="text-sm text-ink-soft">الزخرفة</span>
              <Segmented value={design.decoration.style} onChange={(x) => set("decoration", { style: x })} testId="studio-decoration" label="الزخرفة" options={[{ id: "none", label: "بدون" }, { id: "frame", label: "إطار ذهبي" }, { id: "lines", label: "خط فاصل" }]} /></div>
            <ColorField label="لون الزخرفة" value={design.decoration.color} swatches={["#E7B85C", "#2563EB", "#F8FAFC"]} onChange={(c) => set("decoration", { color: c })} testId="studio-decoration-color" />
          </>
        )}
      </div>
      <Button className="h-11 w-full" onClick={onNext} data-testid="studio-style-next">التالي: معاينة الفيديو</Button>
    </div>
  );
}
