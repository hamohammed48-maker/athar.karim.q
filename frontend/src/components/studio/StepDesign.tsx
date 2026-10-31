import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Pause, Play, RotateCcw, Trash2, Upload, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RangeField, Segmented, ToggleRow, ColorField } from "@/components/shared/ui-kit";
import { TemplatePreview } from "@/components/studio/StudioCanvas";
import { applyBuiltin, ASPECTS, BUILTIN_BACKGROUNDS, BUILTIN_TEMPLATES, bgUrl, sanitizeDesign, SOLID_BACKGROUNDS, type AspectRatio, type DesignSettings } from "@/lib/rendering/design";
import { IMAGE_TYPES, VIDEO_TYPES, validateBackgroundFile, type BgAsset, type BgStatus } from "@/lib/media/background";
import { storeMedia, useSavedTemplates } from "@/lib/persistence/stores";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

interface Props {
  design: DesignSettings;
  setDesign: (fn: (d: DesignSettings) => DesignSettings) => void;
  verse: Verse | null;
  surahName: string;
  bgStatus: BgStatus;
  bgAsset: BgAsset | null;
  onNext: () => void;
}

export function AspectPicker({ value, onChange }: { value: AspectRatio; onChange: (a: AspectRatio) => void }) {
  return <Segmented<AspectRatio> value={value} onChange={onChange} testId="studio-aspect" label="أبعاد الفيديو" options={ASPECTS.map((a) => ({ id: a.id, label: a.label }))} />;
}

export function StepDesign({ design, setDesign, verse, surahName, bgStatus, bgAsset, onNext }: Props) {
  const { data: saved } = useSavedTemplates();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; url: string; kind: "image" | "video" } | null>(null);
  const [applying, setApplying] = useState(false);
  const bg = design.background;
  const setBg = (patch: Partial<DesignSettings["background"]>) => setDesign((d) => ({ ...d, background: { ...d.background, ...patch } }));
  const video = bgAsset?.el instanceof HTMLVideoElement ? bgAsset.el : null;
  const [videoPaused, setVideoPaused] = useState(false);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    const err = validateBackgroundFile(f);
    if (err) { toast.error(err); return; }
    setPending({ file: f, url: URL.createObjectURL(f), kind: IMAGE_TYPES.includes(f.type) ? "image" : "video" });
  };
  const closePending = () => { if (pending) URL.revokeObjectURL(pending.url); setPending(null); };
  const applyPending = async () => {
    if (!pending) return;
    setApplying(true);
    const { id, persisted } = await storeMedia(pending.file);
    setBg({ kind: pending.kind, mediaId: id, mediaName: pending.file.name, scale: 1, offsetX: 0, offsetY: 0 });
    setApplying(false);
    if (persisted) toast.success("طُبّقت الخلفية وحُفظت على هذا الجهاز");
    closePending();
  };

  return (
    <div className="space-y-8" data-testid="studio-step-design">
      <section className="space-y-3">
        <h3 className="font-semibold">النماذج الجاهزة</h3>
        <p className="text-xs text-ink-muted">تطبيق النموذج يغيّر التصميم فقط ويحافظ على الآيات والقارئ والأبعاد.</p>
        <div className="grid grid-cols-3 gap-3">
          {BUILTIN_TEMPLATES.map((t) => (
            <button key={t.id} type="button" onClick={() => { setDesign((d) => applyBuiltin(d, t)); toast.success(`طُبّق ${t.name}`); }}
              className="group space-y-2 rounded-xl border border-line bg-navy-900 p-2 text-start transition-colors hover:border-gold" data-testid={`studio-template-card-${t.id}`}>
              <TemplatePreview design={{ ...t.design, aspect: design.aspect }} verse={verse} surahName={surahName} testId={`studio-template-preview-${t.id}`} />
              <span className="block text-sm font-semibold">{t.name}</span>
              <span className="block text-xs leading-snug text-ink-muted">{t.description}</span>
            </button>
          ))}
        </div>
        {!!saved?.length && (
          <div className="space-y-2">
            <h4 className="text-sm text-ink-soft">نماذجي المحفوظة</h4>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {saved.map((t) => (
                <button key={t.id} type="button" data-testid={`studio-saved-template-${t.id}`}
                  onClick={() => { setDesign(() => sanitizeDesign(t.design)); toast.success(`طُبّق «${t.name}»`); }}
                  className="w-28 shrink-0 space-y-1 rounded-xl border border-line bg-navy-900 p-1.5 text-start hover:border-gold">
                  {t.thumbnail ? <img src={t.thumbnail} alt="" className="aspect-[9/12] w-full rounded-lg object-cover" /> : <div className="aspect-[9/12] rounded-lg bg-navy-800" />}
                  <span className="block truncate text-xs">{t.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">الخلفية</h3>
        {(bgStatus === "missing" || bgStatus === "error") && (
          <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm" role="alert" data-testid="studio-bg-missing">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            {bgStatus === "missing" ? `ملف الخلفية «${bg.mediaName ?? ""}» غير متوفر على هذا الجهاز. اختر الملف مجدداً.` : "تعذّر فك ترميز ملف الخلفية في هذا المتصفح. اختر ملفاً آخر."}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BUILTIN_BACKGROUNDS.map((b) => (
            <button key={b.id} type="button" onClick={() => setBg({ kind: "builtin", builtinId: b.id })} aria-pressed={bg.kind === "builtin" && bg.builtinId === b.id}
              data-testid={`studio-bg-option-${b.id}`} className={cn("relative overflow-hidden rounded-xl border-2 transition-colors", bg.kind === "builtin" && bg.builtinId === b.id ? "border-action" : "border-transparent hover:border-line")}>
              <img src={bgUrl(b.id, true)} alt={b.label} loading="lazy" className="aspect-[3/4] w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-navy-950/75 px-1 py-0.5 text-center text-[11px]">{b.label}</span>
            </button>
          ))}
          {SOLID_BACKGROUNDS.map((c) => (
            <button key={c} type="button" onClick={() => setBg({ kind: "color", color: c })} aria-pressed={bg.kind === "color" && bg.color === c} aria-label={`خلفية لون ${c}`}
              data-testid={`studio-bg-color-${c.slice(1)}`} style={{ background: c }}
              className={cn("aspect-[3/4] rounded-xl border-2", bg.kind === "color" && bg.color === c ? "border-action" : "border-line")} />
          ))}
        </div>
        <input ref={fileRef} type="file" accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")} className="hidden" data-testid="studio-bg-upload-input"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="studio-bg-upload-button">
            {bg.kind === "image" || bg.kind === "video" ? <><Upload className="size-4" /> استبدال الخلفية</> : <><ImagePlus className="size-4" /> صورة أو فيديو من جهازك</>}
          </Button>
          {(bg.kind === "image" || bg.kind === "video") && (
            <>
              <Button variant="ghost" onClick={() => setBg({ kind: "color", mediaId: null, mediaName: null })} data-testid="studio-bg-remove"><Trash2 className="size-4" /> إزالة</Button>
              <Button variant="ghost" onClick={() => setBg({ kind: "builtin", builtinId: "night-mosque", mediaId: null, mediaName: null })} data-testid="studio-bg-reset"><RotateCcw className="size-4" /> خلفية مدمجة</Button>
            </>
          )}
          {video && (
            <Button variant="ghost" data-testid="studio-bg-video-toggle" onClick={() => { if (video.paused) { void video.play(); setVideoPaused(false); } else { video.pause(); setVideoPaused(true); } }}>
              {videoPaused ? <Play className="size-4" /> : <Pause className="size-4" />} {videoPaused ? "تشغيل الخلفية" : "إيقاف الخلفية"}
            </Button>
          )}
        </div>
        {(bg.kind === "image" || bg.kind === "video") && bg.mediaName && <p className="text-xs text-ink-muted" data-testid="studio-bg-media-name">الملف: {bg.mediaName} (يبقى على جهازك ولا يُرفع إلى أي خادم)</p>}

        {bg.kind !== "color" && (
          <div className="grid gap-4 rounded-xl bg-navy-900 p-4 sm:grid-cols-2">
            <Segmented value={bg.fit} onChange={(v) => setBg({ fit: v })} testId="studio-bg-fit" label="ملاءمة" options={[{ id: "cover", label: "ملء الإطار" }, { id: "contain", label: "احتواء كامل" }]} />
            <RangeField label="التكبير" value={bg.scale} min={1} max={2} step={0.05} onChange={(v) => setBg({ scale: v })} testId="studio-bg-scale" format={(v) => `${Math.round(v * 100)}%`} />
            <RangeField label="الإزاحة الأفقية" value={bg.offsetX} min={-50} max={50} onChange={(v) => setBg({ offsetX: v })} testId="studio-bg-offset-x" />
            <RangeField label="الإزاحة العمودية" value={bg.offsetY} min={-50} max={50} onChange={(v) => setBg({ offsetY: v })} testId="studio-bg-offset-y" />
            <ToggleRow label="حركة تكبير بطيئة" checked={bg.motion === "zoom"} onChange={(v) => setBg({ motion: v ? "zoom" : "none" })} testId="studio-bg-motion" />
          </div>
        )}
        <div className="grid gap-4 rounded-xl bg-navy-900 p-4 sm:grid-cols-2">
          <RangeField label="تعتيم الخلفية" value={bg.overlayOpacity} min={0} max={0.85} step={0.05} onChange={(v) => setBg({ overlayOpacity: v })} testId="studio-bg-overlay" format={(v) => `${Math.round(v * 100)}%`} />
          <ColorField label="لون التعتيم" value={bg.overlayColor} swatches={["#071827", "#000000", "#0B2233", "#2B1E12"]} onChange={(c) => setBg({ overlayColor: c })} testId="studio-bg-overlay-color" />
        </div>
      </section>
      <Button className="h-11 w-full" onClick={onNext} data-testid="studio-design-next">التالي: تخصيص النص والتأثيرات</Button>

      <Dialog open={!!pending} onOpenChange={(o) => !o && closePending()}>
        <DialogContent className="max-w-md" dir="rtl" data-testid="studio-bg-preview-dialog">
          <DialogHeader>
            <DialogTitle>معاينة الخلفية</DialogTitle>
            <DialogDescription>{pending?.file.name}</DialogDescription>
          </DialogHeader>
          {pending?.kind === "image" && <img src={pending.url} alt="معاينة" className="max-h-[50vh] w-full rounded-lg object-contain" />}
          {pending?.kind === "video" && <video src={pending.url} className="max-h-[50vh] w-full rounded-lg" muted loop autoPlay playsInline controls />}
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closePending} data-testid="studio-bg-preview-cancel">إلغاء</Button>
            <Button onClick={applyPending} disabled={applying} data-testid="studio-bg-preview-apply">تطبيق الخلفية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
