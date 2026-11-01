import { useMemo } from "react";
import { Gauge, Loader2, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { quranPlayer, usePlayer } from "@/lib/audio/player";
import { formatTime, toArabicDigits } from "@/lib/quran/format";
import { useChapters, useReciters } from "@/lib/quran/hooks";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const RATES = [0.75, 1, 1.25, 1.5];

/** Sticky recitation bar for the Quran section. Shows only when something was queued for playback. */
export function QuranAudioBar() {
  const s = usePlayer(quranPlayer);
  const { data: chapters } = useChapters();
  const { data: reciters } = useReciters();
  const { reciterId } = useSettings();
  const label = useMemo(() => {
    if (!s.verseKey) return "";
    const [c, v] = s.verseKey.split(":").map(Number);
    const name = chapters?.find((x) => x.id === c)?.name_arabic ?? "";
    return `سورة ${name} · الآية ${toArabicDigits(v)}`;
  }, [s.verseKey, chapters]);
  if (!quranPlayer.items.length) return null;
  const reciter = reciters?.find((r) => r.id === reciterId);
  const busy = s.status === "loading";
  const playing = s.status === "playing" || busy;

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-navy-900/95 backdrop-blur-xl md:bottom-0" data-testid="quran-audio-bar" role="region" aria-label="مشغل التلاوة">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <p className="truncate font-semibold" data-testid="audio-bar-verse-label">{label}</p>
            <p className="truncate text-xs text-gold" data-testid="audio-bar-reciter">{reciter?.name ?? ""}</p>
          </div>
          {s.error && <p className="text-xs text-danger" role="alert" data-testid="audio-bar-error">{s.error}</p>}
          <button type="button" aria-label="إغلاق المشغل" data-testid="audio-bar-close"
            onClick={() => { quranPlayer.load([]); }} className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-navy-800">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-10 text-xs tabular-nums text-ink-soft">{formatTime(s.globalMs)}</span>
          <input type="range" min={0} max={Math.max(1, s.totalMs)} value={s.globalMs} aria-label="موضع التشغيل"
            onChange={(e) => void quranPlayer.seekGlobal(Number(e.target.value))} className="h-2 flex-1" data-testid="audio-bar-seek" />
          <span className="w-10 text-xs tabular-nums text-ink-soft">{formatTime(s.totalMs)}</span>
        </div>
        <div className="flex items-center justify-center gap-2">
          <button type="button" aria-label="سرعة التشغيل" data-testid="audio-bar-rate"
            onClick={() => quranPlayer.setRate(RATES[(RATES.indexOf(s.rate) + 1) % RATES.length] ?? 1)}
            className="flex h-10 items-center gap-1 rounded-lg px-3 text-xs text-ink-soft hover:bg-navy-800">
            <Gauge className="size-4" /> {s.rate}x
          </button>
          <button type="button" aria-label="الآية السابقة" onClick={() => quranPlayer.jump(-1)} data-testid="audio-bar-prev"
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-navy-800">
            <SkipForward className="size-5" />
          </button>
          <button type="button" aria-label={playing ? "إيقاف مؤقت" : "تشغيل"} onClick={() => quranPlayer.toggle()} data-testid="audio-player-toggle-btn"
            className={cn("grid size-12 place-items-center rounded-full bg-action text-white transition-colors hover:bg-action-hover")}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : playing ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
          <button type="button" aria-label="الآية التالية" onClick={() => quranPlayer.jump(1)} data-testid="audio-bar-next"
            className="grid size-11 place-items-center rounded-full text-ink hover:bg-navy-800">
            <SkipBack className="size-5" />
          </button>
          <span className="w-16" />
        </div>
      </div>
    </div>
  );
}
