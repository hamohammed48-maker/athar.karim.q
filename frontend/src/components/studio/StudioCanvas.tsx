import { useEffect, useRef, useState } from "react";
import { ensureFonts, loadLogo, renderFrame } from "@/lib/rendering/renderer";
import { bgUrl, dimensions, type DesignSettings } from "@/lib/rendering/design";
import type { RecitationPlayer } from "@/lib/audio/player";
import type { BgAsset } from "@/lib/media/background";
import type { Verse } from "@/types/quran";

interface Props {
  design: DesignSettings;
  verses: Verse[];
  surahNames: Record<number, string>;
  player: RecitationPlayer;
  getLevels: () => Uint8Array | null;
  background: BgAsset | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  maxHeight?: string;
}

/** Live preview: the exact renderFrame() used by the exporter, drawn at a reduced resolution. */
export function StudioCanvas({ design, verses, surahNames, player, getLevels, background, canvasRef, maxHeight = "62vh" }: Props) {
  const { w, h } = dimensions(design.aspect, 540);
  const [ready, setReady] = useState(false);
  const logo = useRef<HTMLImageElement | null>(null);
  const live = useRef({ design, verses, surahNames, background });
  live.current = { design, verses, surahNames, background };

  useEffect(() => {
    void Promise.all([ensureFonts(), loadLogo().then((l) => (logo.current = l))]).then(() => setReady(true));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !ready) return;
    let raf = 0;
    const start = performance.now();
    const draw = () => {
      const { design: d, verses: vs, surahNames: names, background: bg } = live.current;
      const f = player.frame();
      const verse = vs.find((v) => v.key === f.verseKey) ?? vs[0] ?? null;
      const playing = f.status === "playing";
      renderFrame(ctx, canvas.width, canvas.height, d,
        { verse, surahName: verse ? names[verse.chapter] ?? "" : "", activeWord: playing || f.status === "paused" ? f.activeWord : null, timeSec: (performance.now() - start) / 1000, levels: playing ? getLevels() : null },
        { bg: bg?.el ?? null, bgWidth: bg?.width ?? 0, bgHeight: bg?.height ?? 0, logo: logo.current });
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [ready, player, getLevels, canvasRef, w, h]);

  return (
    <div className="flex justify-center rounded-2xl border border-line bg-navy-900 p-3">
      <canvas ref={canvasRef} width={w} height={h} data-testid="studio-preview-canvas" role="img" aria-label="معاينة الفيديو"
        className="h-auto max-w-full rounded-lg shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
        style={{ aspectRatio: `${w} / ${h}`, maxHeight }} />
    </div>
  );
}

const imgCache = new Map<string, Promise<HTMLImageElement>>();
function builtinImage(id: string) {
  if (!imgCache.has(id)) {
    imgCache.set(id, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = bgUrl(id, true); }));
  }
  return imgCache.get(id)!;
}

/** Static render of a template with the user's own verse — a real preview, not a picture. */
export function TemplatePreview({ design, verse, surahName, testId }: { design: DesignSettings; verse: Verse | null; surahName: string; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = dimensions(design.aspect, 200);
  useEffect(() => {
    let alive = true;
    (async () => {
      await ensureFonts();
      const logo = await loadLogo();
      const img = design.background.kind === "builtin" ? await builtinImage(design.background.builtinId).catch(() => null) : null;
      const ctx = ref.current?.getContext("2d");
      if (!alive || !ctx) return;
      renderFrame(ctx, w, h, design, { verse, surahName, activeWord: verse?.words[1]?.position ?? null, timeSec: 0, levels: null },
        { bg: img, bgWidth: img?.naturalWidth ?? 0, bgHeight: img?.naturalHeight ?? 0, logo });
    })();
    return () => { alive = false; };
  }, [design, verse, surahName, w, h]);
  return <canvas ref={ref} width={w} height={h} className="h-auto w-full rounded-lg" style={{ aspectRatio: `${w} / ${h}` }} data-testid={testId} aria-hidden />;
}
