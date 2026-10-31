import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Info, Search, Shuffle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, LoadingBlock, PageHeader, Segmented } from "@/components/shared/ui-kit";
import { VerseResultCard } from "@/components/quran/VerseActions";
import { fetchRandomVerse, useChapters, useSearch, useTopic, useTopics } from "@/lib/quran/hooks";
import { toArabicDigits } from "@/lib/quran/format";
import { BUILTIN_BACKGROUNDS, bgUrl } from "@/lib/rendering/design";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

type Tab = "search" | "topics" | "random";
const HISTORY_KEY = "athar.randomHistory";

export default function Discovery() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || (sp.get("topic") ? "topics" : "search");
  const setTab = (t: Tab) => setSp({ tab: t }, { replace: true });
  const { data: chapters } = useChapters();
  const names = useMemo(() => Object.fromEntries((chapters ?? []).map((c) => [c.id, c.name_arabic])), [chapters]);

  return (
    <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6">
      <PageHeader title="اكتشاف الآيات" subtitle="ابحث في نص القرآن، تصفّح حسب الموضوع، أو تأمّل آية عشوائية" />
      <Segmented<Tab> value={tab} onChange={setTab} testId="discover-tabs" label="طريقة الاكتشاف"
        options={[{ id: "search", label: "بحث في الآيات" }, { id: "topics", label: "حسب الموضوع" }, { id: "random", label: "آية عشوائية" }]} />
      <div className="mt-6">
        {tab === "search" && <SearchTab names={names} initial={sp.get("q") ?? ""} />}
        {tab === "topics" && <TopicsTab names={names} topicId={sp.get("topic")} onPick={(id) => setSp({ tab: "topics", topic: id })} onBack={() => setSp({ tab: "topics" })} />}
        {tab === "random" && <RandomTab names={names} />}
      </div>
    </div>
  );
}

function SearchTab({ names, initial }: { names: Record<number, string>; initial: string }) {
  const [input, setInput] = useState(initial);
  const [q, setQ] = useState(initial);
  const [chapter, setChapter] = useState<number | null>(null);
  const { data, isFetching, isError, refetch } = useSearch(q, chapter);
  return (
    <div className="space-y-4">
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setQ(input.trim()); }}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="اكتب كلمة من الآية، مثل: الصابرين" className="h-12 ps-11 text-base" data-testid="verse-search-input" aria-label="البحث في نص الآيات" />
        </div>
        <Select value={chapter ? String(chapter) : "all"} onValueChange={(v: string) => setChapter(v === "all" ? null : Number(v))}>
          <SelectTrigger className="h-12 sm:w-52" data-testid="verse-search-surah-filter" aria-label="تصفية حسب السورة">
            <SelectValue>{(v) => (v === "all" ? "كل السور" : `سورة ${names[Number(v)] ?? ""}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-80">
            <SelectItem value="all">كل السور</SelectItem>
            {Object.entries(names).map(([id, n]) => <SelectItem key={id} value={id}>{toArabicDigits(id)}. {n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" className="h-12 px-6" data-testid="verse-search-submit">بحث</Button>
      </form>
      <p className="text-xs text-ink-muted">يتجاهل البحث التشكيل واختلاف صور الهمزة والألف، دون تغيير النص المعروض.</p>
      {isFetching && <LoadingBlock label="جارٍ البحث…" />}
      {isError && <ErrorBlock message="تعذّر البحث. أعد المحاولة." onRetry={() => refetch()} />}
      {data && !isFetching && (
        <>
          <p className="text-sm text-ink-soft" data-testid="verse-search-count">
            {data.total ? `${toArabicDigits(data.total)} نتيجة${data.total > data.results.length ? ` (يُعرض أول ${toArabicDigits(data.results.length)})` : ""}` : "لا توجد نتائج مطابقة."}
            {data.indexed_chapters < 114 && ` — الفهرسة المحلية جارية (${toArabicDigits(data.indexed_chapters)}/١١٤ سورة).`}
          </p>
          <div className="space-y-4">{data.results.map((v) => <VerseResultCard key={v.key} verse={v} surahName={names[v.chapter] ?? ""} />)}</div>
        </>
      )}
    </div>
  );
}

const TOPIC_IMAGES = BUILTIN_BACKGROUNDS.map((b) => b.id);

function TopicsTab({ names, topicId, onPick, onBack }: { names: Record<number, string>; topicId: string | null; onPick: (id: string) => void; onBack: () => void }) {
  const { data: topics, isLoading, isError, refetch } = useTopics();
  const detail = useTopic(topicId);
  if (topicId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="text-sm text-gold hover:underline" data-testid="topic-back-button">→ كل المواضيع</button>
        {detail.isLoading && <LoadingBlock />}
        {detail.isError && <ErrorBlock message="تعذّر تحميل آيات الموضوع." onRetry={() => detail.refetch()} />}
        {detail.data && (
          <>
            <h2 className="text-2xl font-bold text-gold" data-testid="topic-title">{detail.data.name}</h2>
            <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-ink-soft" data-testid="topic-note">
              <Info className="mt-0.5 size-4 shrink-0 text-warning" /> {detail.data.note}
            </p>
            <div className="space-y-4">{detail.data.verses.map((v) => <VerseResultCard key={v.key} verse={v} surahName={names[v.chapter] ?? ""} />)}</div>
          </>
        )}
      </div>
    );
  }
  return (
    <>
      {isLoading && <LoadingBlock />}
      {isError && <ErrorBlock message="تعذّر تحميل المواضيع." onRetry={() => refetch()} />}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {topics?.map((t, i) => (
          <button key={t.id} type="button" onClick={() => onPick(t.id)} data-testid={`topic-card-${t.id}`}
            className="group relative h-32 overflow-hidden rounded-2xl border border-line text-start transition-transform duration-200 hover:-translate-y-0.5">
            <img src={bgUrl(TOPIC_IMAGES[i % TOPIC_IMAGES.length], true)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <span className="absolute inset-0 bg-gradient-to-t from-navy-950/95 via-navy-950/50 to-transparent" />
            <span className="absolute bottom-3 start-3 end-3">
              <span className="block text-lg font-bold">{t.name}</span>
              <span className="block text-xs text-ink-soft">{toArabicDigits(t.verse_keys.length)} آيات مختارة</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function RandomTab({ names }: { names: Record<number, string> }) {
  const [verse, setVerse] = useState<Verse | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const hist: string[] = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]");
      return fetchRandomVerse(hist);
    },
    onSuccess: (v) => {
      const hist: string[] = JSON.parse(sessionStorage.getItem(HISTORY_KEY) ?? "[]");
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify([...hist, v.key].slice(-30)));
      setVerse(v);
    },
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl border border-gold/30 bg-navy-800 p-6">
        <Sparkles className="size-6 text-gold" />
        <p className="text-ink-soft">تُختار الآية عشوائياً من نص المصحف الكامل، مع تجنّب تكرار الآيات التي ظهرت مؤخراً.</p>
        <Button onClick={() => m.mutate()} disabled={m.isPending} className={cn("h-12 border border-gold bg-transparent px-6 text-gold hover:bg-gold/10")} data-testid="random-verse-button">
          <Shuffle className="size-4" /> {verse ? "آية أخرى" : "آية عشوائية"}
        </Button>
      </div>
      {m.isPending && <LoadingBlock />}
      {m.isError && <ErrorBlock message="تعذّر جلب آية. أعد المحاولة." onRetry={() => m.mutate()} />}
      {verse && !m.isPending && <VerseResultCard verse={verse} surahName={names[verse.chapter] ?? ""} />}
    </div>
  );
}
