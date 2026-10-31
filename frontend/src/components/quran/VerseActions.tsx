import { Link, useNavigate } from "react-router-dom";
import { BookOpenText, Clapperboard, Heart, Pause, Play } from "lucide-react";
import { quranPlayer, usePlayer } from "@/lib/audio/player";
import { playVerses } from "@/lib/audio/playVerses";
import { useFavorites, useToggleFavorite } from "@/lib/persistence/stores";
import { toArabicDigits, verseMarker } from "@/lib/quran/format";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

export function VerseActions({ verse, surahName, showRead = true, compact = false }: { verse: Verse; surahName: string; showRead?: boolean; compact?: boolean }) {
  const navigate = useNavigate();
  const s = usePlayer(quranPlayer);
  const { data: favs } = useFavorites();
  const toggle = useToggleFavorite();
  const isFav = !!favs?.some((f) => f.key === verse.key);
  const isPlaying = s.verseKey === verse.key && (s.status === "playing" || s.status === "loading");
  const id = verse.key.replace(":", "-");
  const btn = "flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-soft transition-colors hover:bg-navy-800 hover:text-ink";
  return (
    <div className="flex flex-wrap items-center gap-1">
      {showRead && (
        <Link to={`/quran/${verse.chapter}?verse=${verse.number}`} className={btn} data-testid={`verse-read-${id}`}>
          <BookOpenText className="size-4" /> {!compact && "قراءة"}
        </Link>
      )}
      <button type="button" className={btn} data-testid={`verse-play-${id}`} aria-label="الاستماع إلى الآية"
        onClick={() => (isPlaying ? quranPlayer.pause() : void playVerses([verse.key]))}>
        {isPlaying ? <Pause className="size-4 text-gold" /> : <Play className="size-4" />} {!compact && "الاستماع"}
      </button>
      <button type="button" className={btn} data-testid={`verse-favorite-${id}`} aria-pressed={isFav}
        aria-label={isFav ? "إزالة من المفضلة" : "إضافة إلى المفضلة"} onClick={() => toggle.mutate({ verse, surahName })}>
        <Heart className={cn("size-4", isFav && "fill-danger text-danger")} /> {!compact && (isFav ? "في المفضلة" : "المفضلة")}
      </button>
      <button type="button" className={cn(btn, "text-gold hover:text-gold")} data-testid={`verse-create-video-${id}`}
        onClick={() => navigate(`/studio/edit?verses=${verse.key}`)}>
        <Clapperboard className="size-4" /> {!compact && "إنشاء فيديو"}
      </button>
    </div>
  );
}

export function VerseResultCard({ verse, surahName }: { verse: Verse; surahName: string }) {
  return (
    <article className="animate-fade-up rounded-2xl border border-line bg-navy-900 p-4 sm:p-6" data-testid={`verse-result-${verse.key.replace(":", "-")}`}>
      <p className="quran-text text-2xl text-ink sm:text-[28px]" lang="ar">
        {verse.text} <span className="text-gold">{verseMarker(verse.number)}</span>
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-sm text-gold">[{surahName}: {toArabicDigits(verse.number)}]</span>
        <VerseActions verse={verse} surahName={surahName} />
      </div>
    </article>
  );
}
