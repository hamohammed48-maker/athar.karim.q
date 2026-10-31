import { RecitationPlayer, timelineDuration, type TimelineItem } from "@/lib/audio/player";
import { dimensions, RESOLUTIONS, type DesignSettings } from "@/lib/rendering/design";
import { renderFrame, ensureFonts, loadLogo } from "@/lib/rendering/renderer";
import type { BgAsset } from "@/lib/media/background";
import type { Verse } from "@/types/quran";

const CANDIDATES = [
  { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
  { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4" },
  { mime: "video/mp4", ext: "mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { mime: "video/webm", ext: "webm" },
];

export interface ExportSupport { supported: boolean; mime: string | null; ext: string | null; reason: string | null }

export function detectExportSupport(): ExportSupport {
  if (typeof MediaRecorder === "undefined") return { supported: false, mime: null, ext: null, reason: "المتصفح لا يدعم MediaRecorder" };
  const c = document.createElement("canvas");
  if (typeof c.captureStream !== "function") return { supported: false, mime: null, ext: null, reason: "المتصفح لا يدعم التقاط لوحة الرسم" };
  if (typeof AudioContext === "undefined") return { supported: false, mime: null, ext: null, reason: "المتصفح لا يدعم Web Audio" };
  const hit = CANDIDATES.find((x) => MediaRecorder.isTypeSupported(x.mime));
  if (!hit) return { supported: false, mime: null, ext: null, reason: "لا يتوفر ترميز فيديو مدعوم في هذا المتصفح" };
  return { supported: true, mime: hit.mime, ext: hit.ext, reason: null };
}

export const estimateBytes = (durationMs: number, res: DesignSettings["export"]["resolution"]) => {
  const r = RESOLUTIONS.find((x) => x.id === res) ?? RESOLUTIONS[1];
  return ((r.bitrate + 128_000) / 8) * (durationMs / 1000);
};

export interface ExportJob {
  design: DesignSettings;
  verses: Verse[]; // ordered like the timeline
  surahNames: Record<number, string>;
  timeline: TimelineItem[];
  background: BgAsset | null;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export interface ExportResult { blob: Blob; url: string; mime: string; ext: string; width: number; height: number; durationMs: number }

/**
 * Real-time export: the recitation is played (silently, through Web Audio) while the same
 * renderFrame() used by the preview draws every frame; MediaRecorder muxes canvas + audio.
 */
export async function exportVideo(job: ExportJob): Promise<ExportResult> {
  const support = detectExportSupport();
  if (!support.supported || !support.mime || !support.ext) throw new Error(support.reason ?? "التصدير غير مدعوم");
  const res = RESOLUTIONS.find((x) => x.id === job.design.export.resolution) ?? RESOLUTIONS[1];
  const { w, h } = dimensions(job.design.aspect, res.short);
  await ensureFonts();
  const logo = await loadLogo();

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("تعذّر إنشاء لوحة الرسم");

  const player = new RecitationPlayer();
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaElementSource(player.audio);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const dest = audioCtx.createMediaStreamDestination();
  source.connect(analyser);
  analyser.connect(dest); // not connected to speakers: export is silent for the user
  const levels = new Uint8Array(analyser.frequencyBinCount);

  const vStream = canvas.captureStream(job.design.export.fps);
  const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType: support.mime, videoBitsPerSecond: res.bitrate, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  const bgVideo = job.background?.el instanceof HTMLVideoElement ? job.background.el : null;
  const total = timelineDuration(job.timeline);
  const verseByKey = new Map(job.verses.map((v) => [v.key, v]));
  let raf = 0;
  const started = performance.now();

  const draw = () => {
    const f = player.frame();
    const verse = verseByKey.get(f.verseKey ?? job.timeline[0]?.verseKey ?? "") ?? null;
    const playing = f.status === "playing";
    if (playing) analyser.getByteFrequencyData(levels);
    renderFrame(ctx, w, h, job.design,
      { verse, surahName: verse ? job.surahNames[verse.chapter] ?? "" : "", activeWord: f.activeWord, timeSec: (performance.now() - started) / 1000, levels: playing ? levels : null },
      { bg: job.background?.el ?? null, bgWidth: job.background?.width ?? 0, bgHeight: job.background?.height ?? 0, logo });
    job.onProgress(total ? Math.min(1, f.globalMs / total) : 0);
  };

  const cleanup = () => {
    cancelAnimationFrame(raf);
    player.destroy();
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx.close().catch(() => undefined);
  };

  try {
    await audioCtx.resume();
    player.load(job.timeline, 0);
    if (bgVideo) { bgVideo.currentTime = 0; void bgVideo.play().catch(() => undefined); }
    draw();

    if (job.signal.aborted) throw new DOMException("cancelled", "AbortError");
    let errCheck = 0;
    const done = new Promise<void>((resolve, reject) => {
      player.onEnded = () => { clearInterval(errCheck); setTimeout(resolve, 350); };
      errCheck = window.setInterval(() => {
        const s = player.frame();
        if (s.status === "error") { clearInterval(errCheck); reject(new Error(s.error ?? "تعذّر تشغيل التلاوة أثناء التصدير")); }
      }, 300);
      job.signal.addEventListener("abort", () => { clearInterval(errCheck); reject(new DOMException("cancelled", "AbortError")); });
    });

    recorder.start(1000);
    const loop = () => { draw(); raf = requestAnimationFrame(loop); };
    loop();
    await player.play(0);
    await done;

    const stopped = new Promise<void>((r) => { recorder.onstop = () => r(); });
    recorder.stop();
    await stopped;
    cleanup();
    const blob = new Blob(chunks, { type: support.mime.split(";")[0] });
    if (!blob.size) throw new Error("الملف الناتج فارغ");
    job.onProgress(1);
    return { blob, url: URL.createObjectURL(blob), mime: blob.type, ext: support.ext, width: w, height: h, durationMs: total };
  } catch (e) {
    if (recorder.state !== "inactive") recorder.stop();
    cleanup();
    throw e;
  }
}
