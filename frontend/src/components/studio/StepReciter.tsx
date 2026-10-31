import { useState } from "react";
import { CheckCircle2, Loader2, Pause, Play, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBlock, LoadingBlock } from "@/components/shared/ui-kit";
import { quranPlayer, usePlayer } from "@/lib/audio/player";
import { playVerses } from "@/lib/audio/playVerses";
import { useReciters, useSelectionAudio } from "@/lib/quran/hooks";
import { cn } from "@/lib/utils";
import type { Reciter } from "@/types/quran";

interface Props { reciterId: number; verseKeys: string[]; onChange: (id: number) => void; onNext: () => void; onBeforePreview: () => void }

export function StepReciter({ reciterId, verseKeys, onChange, onNext, onBeforePreview }: Props) {
  const { data: reciters, isLoading, isError, refetch } = useReciters();
  const [previewId, setPreviewId] = useState<number | null>(null);
  return (
    <div className="space-y-4" data-testid="studio-step-reciter">
      <p className="text-sm text-ink-soft">جميع التلاوات من Quran.com. يُعرض توفر توقيت الكلمات لكل قارئ حسب الآيات المختارة.</p>
      {isLoading && <LoadingBlock />}
      {isError && <ErrorBlock message="تعذّر تحميل قائمة القرّاء." onRetry={() => refetch()} />}
      <ul className="space-y-2" role="radiogroup" aria-label="القارئ">
        {reciters?.map((r) => <ReciterRow key={r.id} r={r} selected={r.id === reciterId} verseKeys={verseKeys} onSelect={() => onChange(r.id)} previewActive={previewId === r.id} onPreview={() => { onBeforePreview(); setPreviewId(r.id); }} />)}
      </ul>
      <Button className="h-11 w-full" onClick={onNext} data-testid="studio-reciter-next">التالي: النموذج والخلفية</Button>
    </div>
  );
}

function ReciterRow({ r, selected, verseKeys, onSelect, previewActive, onPreview }: { r: Reciter; selected: boolean; verseKeys: string[]; onSelect: () => void; previewActive: boolean; onPreview: () => void }) {
  const chapters = [...new Set(verseKeys.map((k) => Number(k.split(":")[0])))];
  const audios = useSelectionAudio(r.id, chapters);
  const s = usePlayer(quranPlayer);
  const loading = audios.some((a) => a.isLoading);
  const failed = audios.some((a) => a.isError);
  const wordTiming = audios.length > 0 && audios.every((a) => a.data?.has_word_timing);
  const previewing = previewActive && (s.status === "playing" || s.status === "loading");
  return (
    <li className={cn("flex items-center gap-3 rounded-xl border p-3 transition-colors", selected ? "border-action bg-action/10" : "border-line bg-navy-900")} data-testid={`studio-reciter-${r.id}`}>
      <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-3 text-start" data-testid={`studio-reciter-select-${r.id}`}>
        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-action" : "border-line")}>
          {selected && <span className="size-2.5 rounded-full bg-action" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">{r.name}</span>
          <span className="block text-xs text-ink-muted">{r.style} · {r.name_en}</span>
          <span className="mt-1 flex items-center gap-1 text-xs" data-testid={`studio-reciter-status-${r.id}`}>
            {verseKeys.length === 0 ? <span className="text-ink-muted">اختر آيات لمعرفة التوفر</span>
              : loading ? <><Loader2 className="size-3 animate-spin" /> جارٍ التحقق…</>
              : failed ? <><XCircle className="size-3 text-danger" /> <span className="text-danger">التلاوة غير متاحة لهذه الآيات</span></>
              : <><CheckCircle2 className="size-3 text-success" /> <span className="text-success">متاحة</span> · {wordTiming ? "توقيت الكلمات متاح" : "بدون توقيت كلمات"}</>}
          </span>
        </span>
      </button>
      <Button variant="ghost" size="icon" aria-label={`معاينة صوت ${r.name}`} disabled={!verseKeys.length || failed} data-testid={`studio-reciter-preview-${r.id}`}
        onClick={() => {
          if (previewing) { quranPlayer.pause(); return; }
          onPreview();
          void playVerses([verseKeys[0]], 0, r.id);
        }}>
        {previewing ? <Pause /> : <Play />}
      </Button>
    </li>
  );
}
