import { useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { AlertTriangle, CheckCircle2, Download, Loader2, Share2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RangeField, Segmented } from "@/components/shared/ui-kit";
import { AspectPicker } from "@/components/studio/StepDesign";
import { detectExportSupport, estimateBytes, exportVideo, type ExportResult } from "@/lib/export/exporter";
import { dimensions, RESOLUTIONS, type DesignSettings, type Resolution } from "@/lib/rendering/design";
import { formatBytes, formatTime, toArabicDigits } from "@/lib/quran/format";
import type { TimelineItem } from "@/lib/audio/player";
import type { BgAsset } from "@/lib/media/background";
import type { Verse } from "@/types/quran";

interface Props {
  design: DesignSettings;
  setDesign: (fn: (d: DesignSettings) => DesignSettings) => void;
  verses: Verse[];
  names: Record<number, string>;
  timeline: TimelineItem[] | null;
  timelineError: string | null;
  totalMs: number;
  background: BgAsset | null;
  projectName: string;
  onBeforeExport: () => void;
}

export function StepExport({ design, setDesign, verses, names, timeline, timelineError, totalMs, background, projectName, onBeforeExport }: Props) {
  const support = useMemo(() => detectExportSupport(), []);
  const [phase, setPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [verified, setVerified] = useState<string | null>(null);
  const [fileAction, setFileAction] = useState<"idle" | "saving" | "sharing">("idle");
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const res = RESOLUTIONS.find((r) => r.id === design.export.resolution) ?? RESOLUTIONS[1];
  const dims = dimensions(design.aspect, res.short);
  const longWarning = totalMs > 5 * 60 * 1000;

  const start = async () => {
    if (!timeline) return;
    onBeforeExport();
    if (result) URL.revokeObjectURL(result.url);
    setResult(null); setVerified(null); setErr(null); setProgress(0); setPhase("running");
    abort.current = new AbortController();
    try {
      const r = await exportVideo({ design, verses, surahNames: names, timeline, background, onProgress: setProgress, signal: abort.current.signal });
      setResult(r);
      setPhase("done");
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") { setPhase("idle"); return; }
      setErr(e instanceof Error ? e.message : "فشل التصدير");
      setPhase("error");
    }
  };

  const fileName = `athar-kareem-${projectName.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40)}.${result?.ext ?? support.ext ?? "webm"}`;
  const saveVideo = async () => {
    if (!result || fileAction !== "idle") return;
    setFileAction("saving");
    setFileMessage(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("تعذّر تجهيز ملف الفيديو"));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(result.blob);
        });
        const saved = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents, recursive: true });
        setFileMessage("تم حفظ الفيديو في مجلد Documents على جهازك.");
        return saved.uri;
      }
      const link = document.createElement("a");
      link.href = result.url;
      link.download = fileName;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setFileMessage("بدأ تنزيل الفيديو.");
    } catch (e) {
      setFileMessage(e instanceof Error ? e.message : "تعذّر حفظ الفيديو");
    } finally {
      setFileAction("idle");
    }
  };
  const share = async () => {
    if (!result || fileAction !== "idle") return;
    setFileAction("sharing");
    setFileMessage(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error("تعذّر تجهيز ملف الفيديو"));
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.readAsDataURL(result.blob);
        });
        const saved = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache, recursive: true });
        await Share.share({ title: "أثر كريم", files: [saved.uri], dialogTitle: "مشاركة الفيديو" });
      } else {
        const file = new File([result.blob], fileName, { type: result.mime });
        if (!navigator.canShare?.({ files: [file] })) throw new Error("المشاركة غير مدعومة في هذا المتصفح");
        await navigator.share({ files: [file], title: "أثر كريم" });
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setFileMessage(e instanceof Error ? e.message : "تعذّرت مشاركة الفيديو");
    } finally {
      setFileAction("idle");
    }
  };
  const canShare = !!result && (Capacitor.isNativePlatform() || typeof navigator.share === "function");

  return (
    <div className="space-y-6" data-testid="studio-step-export">
      <div className="space-y-4 rounded-2xl border border-line bg-navy-900 p-4">
        <div className="space-y-2"><span className="text-sm text-ink-soft">نسبة العرض</span>
          <AspectPicker value={design.aspect} onChange={(a) => setDesign((d) => ({ ...d, aspect: a }))} /></div>
        <div className="space-y-2"><span className="text-sm text-ink-soft">الدقة</span>
          <Segmented<Resolution> value={design.export.resolution} onChange={(r) => setDesign((d) => ({ ...d, export: { ...d.export, resolution: r } }))} testId="studio-resolution" label="الدقة"
            options={RESOLUTIONS.map((r) => ({ id: r.id, label: r.label }))} />
          <p className="text-xs text-ink-muted">دقة 4K غير معروضة لأن الترميز داخل المتصفح يعمل في الزمن الحقيقي ولا يمكن ضمانه على معظم الأجهزة.</p></div>
        <p className="text-xs text-ink-muted">معدل الإطارات: ٣٠ إطاراً في الثانية.</p>
        <dl className="grid grid-cols-2 gap-3 text-sm" data-testid="studio-export-summary">
          <div className="rounded-xl bg-navy-800 p-3"><dt className="text-ink-muted">الأبعاد</dt><dd className="font-semibold tabular-nums" dir="ltr">{dims.w}×{dims.h}</dd></div>
          <div className="rounded-xl bg-navy-800 p-3"><dt className="text-ink-muted">المدة</dt><dd className="font-semibold tabular-nums" data-testid="studio-export-duration">{totalMs ? formatTime(totalMs) : "—"}</dd></div>
          <div className="rounded-xl bg-navy-800 p-3"><dt className="text-ink-muted">الحجم التقديري</dt><dd className="font-semibold">{totalMs ? `≈ ${formatBytes(estimateBytes(totalMs, design.export.resolution))}` : "—"}</dd></div>
          <div className="rounded-xl bg-navy-800 p-3"><dt className="text-ink-muted">الصيغة</dt><dd className="font-semibold" data-testid="studio-export-format">{support.ext ? support.ext.toUpperCase() : "غير مدعوم"}</dd></div>
        </dl>
        {support.ext === "webm" && <p className="text-xs text-ink-soft">يدعم متصفحك صيغة WebM فقط للتسجيل؛ تعمل على يوتيوب وأغلب المشغلات، وقد تحتاج بعض المنصات إلى تحويلها إلى MP4.</p>}
        <p className="text-xs text-ink-muted">يُصدَّر الفيديو داخل متصفحك في الزمن الحقيقي (مدة التصدير = مدة التلاوة). أبقِ هذه الصفحة ظاهرة ومفتوحة حتى الانتهاء.</p>
      </div>

      {!support.supported && <Notice text={`التصدير غير متاح: ${support.reason}`} />}
      {timelineError && <Notice text={timelineError} />}
      {longWarning && <Notice text="الفيديو طويل (أكثر من ٥ دقائق) وقد يستهلك ذاكرة كبيرة على الهاتف." tone="warning" />}

      {phase === "running" ? (
        <div className="space-y-3 rounded-2xl border border-action/40 bg-navy-800 p-4" data-testid="studio-export-progress">
          <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" /> جارٍ تصدير الفيديو…</span>
            <span className="tabular-nums" data-testid="studio-export-percent">{toArabicDigits(Math.round(progress * 100))}٪</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-950" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-action transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          </div>
          <Button variant="outline" className="w-full border-danger/50 text-danger" onClick={() => abort.current?.abort()} data-testid="studio-export-cancel"><X className="size-4" /> إلغاء</Button>
        </div>
      ) : (
        <Button className="h-12 w-full text-base" disabled={!support.supported || !timeline || !!timelineError} onClick={start} data-testid="studio-export-action-btn">
          تصدير الفيديو
        </Button>
      )}

      {phase === "error" && err && <Notice text={`فشل التصدير: ${err}`} />}
      {phase === "done" && result && (
        <div className="space-y-3 rounded-2xl border border-success/40 bg-success/10 p-4" data-testid="studio-export-result">
          <p className="flex items-center gap-2 font-semibold text-success"><CheckCircle2 className="size-5" /> اكتمل التصدير — {formatBytes(result.blob.size)}</p>
          <video src={result.url} controls playsInline className="max-h-[50vh] w-full rounded-lg bg-black" data-testid="studio-export-video"
            onLoadedMetadata={(e) => setVerified(`${e.currentTarget.videoWidth}×${e.currentTarget.videoHeight}`)}
            onError={() => setVerified("تعذّر تشغيل الملف في هذا المتصفح")} />
          {verified && <p className="text-xs text-ink-soft" data-testid="studio-export-verified">تحقق المشغّل من الملف: <span dir="ltr">{verified}</span></p>}
          <div className="flex flex-wrap gap-2">
            <Button className="h-11" disabled={fileAction !== "idle"} onClick={() => void saveVideo()} data-testid="studio-download-video-btn">
              {fileAction === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {fileAction === "saving" ? "جارٍ الحفظ…" : "تنزيل الفيديو"}
            </Button>
            {canShare && <Button variant="outline" className="h-11" disabled={fileAction !== "idle"} onClick={() => void share()} data-testid="studio-share-video-btn">
              {fileAction === "sharing" ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />} مشاركة
            </Button>}
          </div>
          {fileMessage && <p className="text-sm text-ink-soft" role="status">{fileMessage}</p>}
        </div>
      )}
    </div>
  );
}

function Notice({ text, tone = "error" }: { text: string; tone?: "error" | "warning" }) {
  return (
    <p className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${tone === "error" ? "border-danger/40 bg-danger/10" : "border-warning/40 bg-warning/10"}`} role="alert" data-testid="studio-export-notice">
      <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${tone === "error" ? "text-danger" : "text-warning"}`} /> {text}
    </p>
  );
}
