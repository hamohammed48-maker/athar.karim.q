import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, CloudOff, Loader2, Pause, Play, Plus, Save, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBlock, LoadingBlock } from "@/components/shared/ui-kit";
import { StudioCanvas } from "@/components/studio/StudioCanvas";
import { StepVerses } from "@/components/studio/StepVerses";
import { StepReciter } from "@/components/studio/StepReciter";
import { AspectPicker, StepDesign } from "@/components/studio/StepDesign";
import { StepStyle } from "@/components/studio/StepStyle";
import { StepExport } from "@/components/studio/StepExport";
import { SaveTemplateDialog } from "@/components/studio/SaveTemplateDialog";
import { useStudioProject } from "@/features/studio/useStudioProject";
import { buildTimeline, quranPlayer, RecitationPlayer, timelineDuration, timelineHasWordTiming, usePlayer } from "@/lib/audio/player";
import { useBackgroundAsset } from "@/lib/media/background";
import { useChapters, useSelectionAudio, useVersesByKeys } from "@/lib/quran/hooks";
import { formatTime, toArabicDigits } from "@/lib/quran/format";
import { defaultDesign } from "@/lib/rendering/design";
import { cn } from "@/lib/utils";
import type { ChapterAudio } from "@/types/quran";

const STEPS = ["اختيار الآيات", "اختيار القارئ", "النموذج والخلفية", "النص والتأثيرات", "معاينة الفيديو", "تصدير الفيديو"];

function makeThumb(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas || !canvas.width) return null;
  try {
    const c = document.createElement("canvas");
    const s = 240 / canvas.width;
    c.width = 240;
    c.height = Math.round(canvas.height * s);
    c.getContext("2d")?.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

export default function StudioEditor() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getThumb = useCallback(() => makeThumb(canvasRef.current), []);
  const { project, update, setDesign, status, error, sourceTemplate } = useStudioProject(getThumb);
  const [step, setStep] = useState(1);
  const [saveOpen, setSaveOpen] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const initialStep = useRef<string | null>(null);

  useEffect(() => {
    if (project && initialStep.current !== project.id) {
      initialStep.current = project.id;
      setStep(project.verseKeys.length ? 2 : 1);
    }
  }, [project]);

  const { data: chapters } = useChapters();
  const names = useMemo(() => Object.fromEntries((chapters ?? []).map((c) => [c.id, c.name_arabic])) as Record<number, string>, [chapters]);
  const keys = useMemo(() => project?.verseKeys ?? [], [project?.verseKeys]);
  const versesQ = useVersesByKeys(keys);
  const verses = useMemo(() => {
    const m = new Map((versesQ.data ?? []).map((v) => [v.key, v]));
    return keys.map((k) => m.get(k)).filter((v): v is NonNullable<typeof v> => !!v);
  }, [versesQ.data, keys]);
  const selChapters = useMemo(() => [...new Set(keys.map((k) => Number(k.split(":")[0])))], [keys]);
  const audioQs = useSelectionAudio(project?.reciterId ?? null, selChapters);
  const audios = audioQs.map((q) => q.data).filter((a): a is ChapterAudio => !!a);
  const audioFailed = audioQs.some((q) => q.isError);
  const audioSig = audios.map((a) => `${a.reciter_id}-${a.chapter}`).join(",");

  const { timeline, timelineError } = useMemo(() => {
    if (!keys.length) return { timeline: null, timelineError: null };
    if (audioFailed) return { timeline: null, timelineError: "تلاوة هذا القارئ غير متاحة لبعض الآيات المختارة — اختر قارئاً آخر." };
    if (audios.length < selChapters.length) return { timeline: null, timelineError: null };
    try {
      return { timeline: buildTimeline(keys, audios), timelineError: null };
    } catch (e) {
      return { timeline: null, timelineError: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, audioSig, audioFailed, selChapters.length]);

  const player = useMemo(() => new RecitationPlayer(), []);
  const graph = useRef<{ ctx: AudioContext; analyser: AnalyserNode; data: Uint8Array<ArrayBuffer> } | null>(null);
  useEffect(() => () => { player.destroy(); void graph.current?.ctx.close(); }, [player]);
  useEffect(() => { player.load(timeline ?? []); }, [timeline, player]);
  const snap = usePlayer(player);

  const ensureGraph = () => {
    if (graph.current || typeof AudioContext === "undefined") return;
    try {
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(player.audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      analyser.connect(ctx.destination);
      graph.current = { ctx, analyser, data: new Uint8Array(analyser.frequencyBinCount) };
    } catch { /* visualizer unavailable; playback still works */ }
  };
  const getLevels = useCallback(() => {
    const g = graph.current;
    if (!g) return null;
    g.analyser.getByteFrequencyData(g.data);
    return g.data;
  }, []);
  const togglePlay = () => {
    quranPlayer.pause();
    ensureGraph();
    void graph.current?.ctx.resume();
    player.toggle();
  };

  const bg = useBackgroundAsset(project?.design.background ?? defaultDesign().background);
  const wordTiming = timeline ? timelineHasWordTiming(timeline) : null;
  const totalMs = timeline ? timelineDuration(timeline) : 0;
  const firstVerse = verses[0] ?? null;

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 pt-12">
        <ErrorBlock message={error} />
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={() => navigate(`/studio/edit?new=${Date.now()}`)} data-testid="studio-error-new">مشروع جديد</Button>
          <Link to="/studio" className="inline-flex h-9 items-center rounded-lg border border-line px-4">الاستوديو</Link>
        </div>
      </div>
    );
  }
  if (!project) return <LoadingBlock label="جارٍ تجهيز المشروع…" />;
  const design = project.design;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6" data-testid="studio-editor">
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Input value={project.name} onChange={(e) => update((p) => ({ ...p, name: e.target.value.slice(0, 60) }))} aria-label="اسم المشروع"
          className="h-11 max-w-xs text-base font-semibold" data-testid="studio-project-name" />
        <span className="flex items-center gap-1 text-xs text-ink-soft" data-testid="studio-save-status" aria-live="polite">
          {status === "saving" || status === "pending" ? <><Loader2 className="size-3 animate-spin" /> جارٍ الحفظ…</>
            : status === "saved" ? <><CheckCircle2 className="size-3 text-success" /> محفوظ على هذا الجهاز</>
            : status === "error" ? <><CloudOff className="size-3 text-danger" /> تعذّر الحفظ المحلي</>
            : "يُحفظ تلقائياً بعد اختيار الآيات"}
        </span>
        <div className="ms-auto flex gap-2">
          <Button variant="outline" className="h-11 border-gold/60 text-gold" onClick={() => { setThumb(getThumb()); setSaveOpen(true); }} data-testid="studio-save-template-button">
            <Save className="size-4" /> حفظ النموذج
          </Button>
          <Button variant="ghost" className="h-11" onClick={() => navigate(`/studio/edit?new=${Date.now()}`)} data-testid="studio-new-project-button"><Plus className="size-4" /> مشروع جديد</Button>
        </div>
      </div>

      <ol className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="خطوات الاستوديو">
        {STEPS.map((s, i) => (
          <li key={s} className="shrink-0">
            <button type="button" onClick={() => setStep(i + 1)} aria-current={step === i + 1 ? "step" : undefined} data-testid={`studio-step-tab-${i + 1}`}
              className={cn("flex h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                step === i + 1 ? "border-action bg-action text-white" : "border-line bg-navy-900 text-ink-soft hover:text-ink")}>
              <span className={cn("grid size-6 place-items-center rounded-full text-xs", step === i + 1 ? "bg-white/20" : "bg-navy-800")}>{toArabicDigits(i + 1)}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:sticky lg:top-20 lg:col-span-7">
          <AspectPicker value={design.aspect} onChange={(a) => setDesign((d) => ({ ...d, aspect: a }))} />
          <StudioCanvas design={design} verses={verses} surahNames={names} player={player} getLevels={getLevels} background={bg.asset} canvasRef={canvasRef}
            maxHeight={step === 5 ? "72vh" : "56vh"} />
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-navy-900 p-3" data-testid="studio-preview-controls">
            <button type="button" onClick={() => player.jump(-1)} disabled={!timeline} aria-label="الآية السابقة" className="grid size-10 place-items-center rounded-full hover:bg-navy-800 disabled:opacity-40"><SkipForward className="size-4" /></button>
            <button type="button" onClick={togglePlay} disabled={!timeline} aria-label={snap.status === "playing" ? "إيقاف المعاينة" : "تشغيل المعاينة"} data-testid="studio-preview-play"
              className="grid size-11 place-items-center rounded-full bg-action text-white hover:bg-action-hover disabled:opacity-40">
              {snap.status === "loading" ? <Loader2 className="size-5 animate-spin" /> : snap.status === "playing" ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            <button type="button" onClick={() => player.jump(1)} disabled={!timeline} aria-label="الآية التالية" className="grid size-10 place-items-center rounded-full hover:bg-navy-800 disabled:opacity-40"><SkipBack className="size-4" /></button>
            <span className="text-xs tabular-nums text-ink-soft" data-testid="studio-preview-time">{formatTime(snap.globalMs)}</span>
            <input type="range" min={0} max={Math.max(1, snap.totalMs)} value={snap.globalMs} onChange={(e) => void player.seekGlobal(Number(e.target.value))}
              disabled={!timeline} className="h-2 flex-1" aria-label="موضع المعاينة" data-testid="studio-preview-seek" />
            <span className="text-xs tabular-nums text-ink-soft">{formatTime(totalMs)}</span>
          </div>
          {!keys.length && <p className="text-center text-sm text-ink-soft">اختر آية واحدة على الأقل لبدء المعاينة.</p>}
          {timelineError && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm" role="alert" data-testid="studio-timeline-error">{timelineError}</p>}
          {snap.error && <p className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm" role="alert">{snap.error}</p>}
        </div>

        <div className="lg:col-span-5">
          {step === 1 && <StepVerses selectedKeys={keys} verses={verses} names={names} onChange={(k) => update((p) => ({ ...p, verseKeys: k }))} onNext={() => setStep(2)} />}
          {step === 2 && <StepReciter reciterId={project.reciterId} verseKeys={keys} onChange={(id) => { player.pause(); update((p) => ({ ...p, reciterId: id })); }} onNext={() => setStep(3)} onBeforePreview={() => player.pause()} />}
          {step === 3 && <StepDesign design={design} setDesign={setDesign} verse={firstVerse} surahName={firstVerse ? names[firstVerse.chapter] ?? "" : ""} bgStatus={bg.status} bgAsset={bg.asset} onNext={() => setStep(4)} />}
          {step === 4 && <StepStyle design={design} setDesign={setDesign} defaults={defaultDesign()} wordTiming={wordTiming} onNext={() => setStep(5)} />}
          {step === 5 && (
            <div className="space-y-4" data-testid="studio-step-preview">
              <p className="rounded-xl bg-navy-900 p-3 text-sm text-ink-soft">المعاينة تستخدم محرّك الرسم نفسه المستخدم في التصدير؛ ما تراه هنا هو ما سيظهر في الفيديو.</p>
              <p className="rounded-xl bg-navy-900 p-3 text-sm" data-testid="studio-preview-tracking-status">
                {wordTiming === null ? "بانتظار بيانات التلاوة…" : wordTiming ? "✓ تتبع الكلمات متزامن مع بيانات التوقيت الفعلية." : "تتبع الكلمات غير متاح لهذا القارئ مع هذه الآيات؛ العرض على مستوى الآية."}
              </p>
              <ol className="space-y-2">
                {verses.map((v, i) => (
                  <li key={v.key}>
                    <button type="button" onClick={() => { ensureGraph(); quranPlayer.pause(); void player.play(i); }} data-testid={`studio-preview-verse-${i + 1}`}
                      className={cn("w-full rounded-xl border p-3 text-start", snap.verseKey === v.key ? "border-gold bg-gold/10" : "border-line bg-navy-900 hover:border-ink-muted")}>
                      <span className="font-quran line-clamp-1 text-lg">{v.text}</span>
                      <span className="text-xs text-gold">{names[v.chapter]} {toArabicDigits(v.number)}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Button className="h-11 w-full" onClick={() => setStep(6)} data-testid="studio-preview-next">التالي: التصدير</Button>
            </div>
          )}
          {step === 6 && (
            <StepExport design={design} setDesign={setDesign} verses={verses} names={names} timeline={timeline} timelineError={timelineError} totalMs={totalMs}
              background={bg.asset} projectName={project.name} onBeforeExport={() => { player.pause(); quranPlayer.pause(); }} />
          )}
        </div>
      </div>
      <SaveTemplateDialog open={saveOpen} onOpenChange={setSaveOpen} design={design} thumbnail={thumb} sourceTemplate={sourceTemplate} />
    </div>
  );
}
