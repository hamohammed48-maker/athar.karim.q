import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Clapperboard, Download, Heart, ListChecks, Loader2, Minus, Play, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, LoadingBlock, ToggleRow } from "@/components/shared/ui-kit";
import { quranPlayer, usePlayer } from "@/lib/audio/player";
import { playVerses } from "@/lib/audio/playVerses";
import { downloadChapterAudio, getDownloadedAudio } from "@/lib/audio/offlineAudio";
import { toast } from "sonner";
import { useFavorites, useToggleFavorite } from "@/lib/persistence/stores";
import { revelationLabel, toArabicDigits, verseMarker } from "@/lib/quran/format";
import { useChapter, useChapters, useReciters } from "@/lib/quran/hooks";
import { saveReadPosition, updateSettings, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

export default function QuranReader() {
  const { chapter: param } = useParams();
  const n = Math.min(114, Math.max(1, Number(param) || 1));
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const { data: chapters } = useChapters();
  const { data: reciters } = useReciters();
  const { data, isLoading, isError, refetch } = useChapter(n);
  const { data: favs } = useFavorites();
  const toggleFav = useToggleFavorite();
  const player = usePlayer(quranPlayer);
  const [selected, setSelected] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [audioDownloading, setAudioDownloading] = useState(false);
  const [audioDownloaded, setAudioDownloaded] = useState(false);
  const [range, setRange] = useState({ from: 1, to: 1 });
  const listRef = useRef<HTMLDivElement>(null);
  const name = data?.chapter.name_arabic ?? "";

  useEffect(() => {
    let active = true;
    void getDownloadedAudio(settings.reciterId, n).then((item) => { if (active) setAudioDownloaded(!!item); });
    return () => { active = false; };
  }, [settings.reciterId, n]);

  const downloadAudio = async () => {
    const reciter = reciters?.find((item) => item.id === settings.reciterId);
    if (!reciter || !data || audioDownloading) return;
    setAudioDownloading(true);
    try {
      await downloadChapterAudio(reciter, n, name);
      setAudioDownloaded(true);
      toast.success(`تم تنزيل صوت سورة ${name} للقارئ ${reciter.name} ويمكن الاستماع إليها دون إنترنت.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تنزيل صوت السورة.");
    } finally {
      setAudioDownloading(false);
    }
  };
  const favSet = useMemo(() => new Set(favs?.map((f) => f.key)), [favs]);

  useEffect(() => { setSelected([]); setAnchor(null); }, [n]);

  // Scroll to ?verse=N once verses render
  useEffect(() => {
    const v = Number(sp.get("verse"));
    if (!data || !v) return;
    const el = document.getElementById(`verse-${v}`);
    el?.scrollIntoView({ block: "center" });
  }, [data, sp]);

  // Follow the verse being recited
  useEffect(() => {
    if (!player.verseKey || player.status !== "playing") return;
    const [c, v] = player.verseKey.split(":").map(Number);
    if (c === n) document.getElementById(`verse-${v}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [player.verseKey, player.status, n]);

  // Reading progress + last read position
  useEffect(() => {
    if (!data) return;
    let t = 0;
    const onScroll = () => {
      const el = listRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight / 2 - r.top) / r.height));
      setProgress(p);
      clearTimeout(t);
      t = window.setTimeout(() => {
        const mid = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.closest("[data-verse]");
        const v = Number(mid?.getAttribute("data-verse"));
        if (v) saveReadPosition({ chapter: n, verse: v, name: data.chapter.name_arabic, at: Date.now() });
      }, 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(t); };
  }, [data, n]);

  const toggleSelect = (v: number, shift: boolean) => {
    setSelected((cur) => {
      if (shift && anchor !== null) {
        const [a, b] = [Math.min(anchor, v), Math.max(anchor, v)];
        const set = new Set(cur);
        for (let i = a; i <= b; i++) set.add(i);
        return [...set].sort((x, y) => x - y);
      }
      return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v].sort((x, y) => x - y);
    });
    setAnchor(v);
  };

  const applyRange = () => {
    const max = data?.chapter.verses_count ?? 1;
    const a = Math.max(1, Math.min(range.from, range.to));
    const b = Math.min(max, Math.max(range.from, range.to));
    setSelected((cur) => [...new Set([...cur, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)])].sort((x, y) => x - y));
  };

  const keysFrom = (from: number) => Array.from({ length: (data?.chapter.verses_count ?? 0) - from + 1 }, (_, i) => `${n}:${from + i}`);
  const playFrom = (v: number) => void playVerses(keysFrom(1), v - 1);
  const createVideo = () => navigate(`/studio/edit?verses=${selected.map((v) => `${n}:${v}`).join(",")}`);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-4 sm:px-6" data-testid="quran-reader-container">
      <div className="fixed inset-x-0 top-16 z-30 h-0.5 bg-line/40" aria-hidden>
        <div className="h-full bg-gold transition-[width] duration-150" style={{ width: `${progress * 100}%` }} data-testid="reader-progress" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-2">
          <Link to="/quran" className="grid size-10 place-items-center rounded-lg hover:bg-navy-800" aria-label="العودة إلى فهرس السور" data-testid="reader-back-button">
            <ChevronRight className="size-5" />
          </Link>
          <Select value={String(n)} onValueChange={(v: string) => navigate(`/quran/${v}`)}>
            <SelectTrigger className="h-11 min-w-48" data-testid="reader-surah-select" aria-label="اختيار السورة">
              <SelectValue>{(v) => `${toArabicDigits(v as string)}. سورة ${chapters?.find((c) => String(c.id) === v)?.name_arabic ?? ""}`}</SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {chapters?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{toArabicDigits(c.id)}. سورة {c.name_arabic}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="تصغير الخط" data-testid="reader-font-decrease" onClick={() => updateSettings({ quranFontSize: Math.max(20, settings.quranFontSize - 2) })}><Minus /></Button>
          <span className="w-8 text-center text-sm tabular-nums text-ink-soft" data-testid="reader-font-size">{settings.quranFontSize}</span>
          <Button variant="ghost" size="icon" aria-label="تكبير الخط" data-testid="reader-font-increase" onClick={() => updateSettings({ quranFontSize: Math.min(56, settings.quranFontSize + 2) })}><Plus /></Button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-line bg-navy-900 p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <span className="text-sm text-ink-soft">القارئ</span>
          <Select value={String(settings.reciterId)} onValueChange={(v: string) => { quranPlayer.load([]); updateSettings({ reciterId: Number(v) }); }}>
            <SelectTrigger className="h-11 w-full" data-testid="audio-player-reciter-select" aria-label="اختيار القارئ">
              <SelectValue>{(v) => { const r = reciters?.find((x) => String(x.id) === v); return r ? `${r.name} — ${r.style}` : "…"; }}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {reciters?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.name} — {r.style}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <ToggleRow label="إظهار الترجمة (Saheeh International)" checked={settings.showTranslation} onChange={(v) => updateSettings({ showTranslation: v })} testId="reader-translation-toggle" />
          <ToggleRow label="تتبع الكلمات أثناء التلاوة" checked={settings.readerWordHighlight} onChange={(v) => updateSettings({ readerWordHighlight: v })} testId="reader-word-highlight-toggle" />
        </div>
      </div>

      {isLoading && <LoadingBlock label="جارٍ تحميل السورة…" />}
      {isError && <ErrorBlock message="تعذّر تحميل السورة. تحقّق من الاتصال." onRetry={() => refetch()} />}

      {data && (
        <>
          <header className="relative mb-6 overflow-hidden rounded-2xl border border-gold/30 bg-navy-800 px-6 py-6 text-center">
            <div className="geo-pattern absolute inset-0" aria-hidden />
            <h1 className="relative font-quran text-4xl text-gold" data-testid="reader-surah-name">سورة {name}</h1>
            <p className="relative mt-2 text-sm text-ink-soft">{revelationLabel(data.chapter.revelation_place)} · {toArabicDigits(data.chapter.verses_count)} آية · ترتيب النزول {toArabicDigits(data.chapter.revelation_order)}</p>
            <div className="relative mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => playFrom(1)} className="h-10" data-testid="reader-play-surah"><Play className="size-4" /> استماع للسورة</Button>
              <Button variant="outline" onClick={() => void downloadAudio()} disabled={audioDownloading || audioDownloaded || !reciters?.length} className="h-10" data-testid="reader-download-audio">
                {audioDownloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {audioDownloading ? "جارٍ تنزيل الصوت…" : audioDownloaded ? "الصوت محفوظ دون إنترنت" : "تحميل الصوت دون إنترنت"}
              </Button>
              <Popover>
                <PopoverTrigger render={<Button variant="outline" className="h-10" data-testid="reader-range-button" />}>
                  <ListChecks className="size-4" /> تحديد نطاق
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-3" dir="rtl">
                  <p className="text-sm font-semibold">تحديد نطاق آيات</p>
                  <div className="flex items-center gap-2 text-sm">
                    من <input type="number" min={1} max={data.chapter.verses_count} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: Number(e.target.value) }))} className="h-10 w-20 rounded-lg border border-line bg-navy-900 px-2" data-testid="reader-range-from" aria-label="من الآية" />
                    إلى <input type="number" min={1} max={data.chapter.verses_count} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: Number(e.target.value) }))} className="h-10 w-20 rounded-lg border border-line bg-navy-900 px-2" data-testid="reader-range-to" aria-label="إلى الآية" />
                  </div>
                  <Button className="w-full" onClick={applyRange} data-testid="reader-range-apply">تحديد</Button>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          {data.chapter.bismillah_pre && (
            <p className="quran-text mb-4 text-center text-3xl text-ink" data-testid="reader-bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</p>
          )}

          <div ref={listRef} className="divide-y divide-line/60">
            {data.verses.map((v) => {
              const isCurrent = player.verseKey === v.key && player.status !== "idle";
              const isSel = selected.includes(v.number);
              return (
                <div key={v.key} id={`verse-${v.number}`} data-verse={v.number} data-testid={`verse-row-${v.number}`}
                  className={cn("scroll-mt-40 px-2 py-5 transition-colors duration-300", isCurrent && "rounded-xl bg-navy-800/70", isSel && "rounded-xl bg-action/10 ring-1 ring-action/50")}>
                  <p className="quran-text text-ink" style={{ fontSize: settings.quranFontSize }} lang="ar">
                    {v.words.map((w) => (
                      <span key={w.position} className={cn("transition-colors duration-150", isCurrent && settings.readerWordHighlight && player.activeWord === w.position && "text-gold")}>
                        {w.text}{" "}
                      </span>
                    ))}
                    <span className="text-gold">{verseMarker(v.number)}</span>
                  </p>
                  {settings.showTranslation && <p dir="ltr" lang="en" className="mt-3 text-left text-[15px] leading-relaxed text-ink-soft" data-testid={`verse-translation-${v.number}`}>{v.translation}</p>}
                  <div className="mt-3 flex items-center gap-1 text-ink-soft">
                    <button type="button" onClick={(e) => toggleSelect(v.number, e.shiftKey)} aria-pressed={isSel} data-testid={`verse-select-checkbox-${v.number}`}
                      className={cn("flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm transition-colors hover:bg-navy-800", isSel && "text-[#93C5FD]")}>
                      <span className={cn("grid size-5 place-items-center rounded border", isSel ? "border-action bg-action text-white" : "border-line")}>{isSel && "✓"}</span>
                      {isSel ? "محددة" : "تحديد"}
                    </button>
                    <button type="button" onClick={() => playFrom(v.number)} className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-navy-800" data-testid={`verse-play-button-${v.number}`} aria-label={`تشغيل من الآية ${v.number}`}>
                      <Play className="size-4" /> استماع
                    </button>
                    <button type="button" onClick={() => toggleFav.mutate({ verse: v, surahName: name })} aria-pressed={favSet.has(v.key)} data-testid={`verse-favorite-button-${v.number}`}
                      className="flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm hover:bg-navy-800" aria-label="المفضلة">
                      <Heart className={cn("size-4", favSet.has(v.key) && "fill-danger text-danger")} /> <span className="hidden sm:inline">المفضلة</span>
                    </button>
                    <span className="ms-auto text-xs text-ink-muted">الجزء {toArabicDigits(v.juz)} · ص {toArabicDigits(v.page)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between py-8">
            {n > 1 ? <Link to={`/quran/${n - 1}`} className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 hover:bg-navy-800" data-testid="reader-prev-surah"><ChevronRight className="size-4" /> السورة السابقة</Link> : <span />}
            {n < 114 ? <Link to={`/quran/${n + 1}`} className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 hover:bg-navy-800" data-testid="reader-next-surah">السورة التالية <ChevronLeft className="size-4" /></Link> : <span />}
          </div>
        </>
      )}

      {selected.length > 0 && (
        <div className={cn("fixed inset-x-3 z-40 mx-auto max-w-3xl animate-fade-up rounded-2xl border border-action/50 bg-navy-800/95 p-3 shadow-2xl backdrop-blur-xl", quranPlayer.items.length ? "bottom-[calc(4rem+env(safe-area-inset-bottom)+11rem)] md:bottom-40" : "bottom-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:bottom-6")} data-testid="reader-selection-bar">
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger render={<button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-navy-700" data-testid="reader-selection-review" />}>
                {toArabicDigits(selected.length)} آيات محددة ▾
              </PopoverTrigger>
              <PopoverContent className="max-h-72 w-80 overflow-y-auto" dir="rtl">
                <ul className="space-y-2">
                  {selected.map((v) => (
                    <li key={v} className="flex items-start justify-between gap-2 text-sm">
                      <span className="font-quran line-clamp-2 text-lg">{data?.verses[v - 1]?.text} {verseMarker(v)}</span>
                      <button type="button" aria-label="إزالة" onClick={() => setSelected((s) => s.filter((x) => x !== v))} className="text-ink-muted hover:text-danger"><X className="size-4" /></button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" onClick={() => setSelected([])} data-testid="reader-selection-clear">مسح التحديد</Button>
            <Button className="ms-auto h-11 px-5" onClick={createVideo} data-testid="reader-create-video-button">
              <Clapperboard className="size-4" /> أنشئ فيديو بهذه الآيات
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
