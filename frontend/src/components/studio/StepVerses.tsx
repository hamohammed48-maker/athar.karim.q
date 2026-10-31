import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Shuffle, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErrorBlock, LoadingBlock, Segmented } from "@/components/shared/ui-kit";
import { fetchRandomVerse, useChapter, useSearch, useTopic, useTopics } from "@/lib/quran/hooks";
import { toArabicDigits, verseMarker } from "@/lib/quran/format";
import { MAX_VERSES } from "@/features/studio/useStudioProject";
import { cn } from "@/lib/utils";
import type { Verse } from "@/types/quran";

interface Props {
  selectedKeys: string[];
  verses: Verse[];
  names: Record<number, string>;
  onChange: (keys: string[]) => void;
  onNext: () => void;
}

type Src = "surah" | "search" | "topic" | "random";

export function StepVerses({ selectedKeys, verses, names, onChange, onNext }: Props) {
  const [src, setSrc] = useState<Src>("surah");
  const add = (keys: string[]) => {
    const fresh = keys.filter((k) => !selectedKeys.includes(k));
    if (!fresh.length) { toast.info("الآيات مضافة مسبقاً"); return; }
    const next = [...selectedKeys, ...fresh].slice(0, MAX_VERSES);
    if (selectedKeys.length + fresh.length > MAX_VERSES) toast.warning(`الحد الأقصى ${toArabicDigits(MAX_VERSES)} آية لكل فيديو`);
    onChange(next);
  };
  const remove = (k: string) => onChange(selectedKeys.filter((x) => x !== k));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= selectedKeys.length) return;
    const a = [...selectedKeys];
    [a[i], a[j]] = [a[j], a[i]];
    onChange(a);
  };
  const byKey = new Map(verses.map((v) => [v.key, v]));

  return (
    <div className="space-y-6" data-testid="studio-step-verses">
      <Segmented<Src> value={src} onChange={setSrc} testId="studio-verse-source" label="مصدر الآيات"
        options={[{ id: "surah", label: "من السورة" }, { id: "search", label: "بحث" }, { id: "topic", label: "حسب الموضوع" }, { id: "random", label: "عشوائية" }]} />
      {src === "surah" && <FromSurah names={names} selected={selectedKeys} onAdd={add} onRemove={remove} />}
      {src === "search" && <FromSearch names={names} selected={selectedKeys} onAdd={add} />}
      {src === "topic" && <FromTopic names={names} selected={selectedKeys} onAdd={add} />}
      {src === "random" && <FromRandom names={names} onAdd={add} />}

      <section className="rounded-2xl border border-line bg-navy-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">الآيات المختارة <span className="text-gold" data-testid="studio-selected-count">({toArabicDigits(selectedKeys.length)})</span></h3>
          {selectedKeys.length > 0 && <Button variant="ghost" size="sm" onClick={() => onChange([])} data-testid="studio-clear-verses"><Trash2 className="size-4" /> مسح الكل</Button>}
        </div>
        {selectedKeys.length === 0 && <p className="py-4 text-center text-sm text-ink-soft">لم تُختر آيات بعد.</p>}
        <ol className="space-y-2">
          {selectedKeys.map((k, i) => {
            const v = byKey.get(k);
            return (
              <li key={k} className="flex items-center gap-2 rounded-xl bg-navy-800 p-2" data-testid={`studio-selected-${k.replace(":", "-")}`}>
                <span className="w-8 text-center text-xs text-ink-muted">{toArabicDigits(i + 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-quran line-clamp-1 text-lg">{v?.text ?? "…"}</p>
                  <p className="text-xs text-gold">{names[Number(k.split(":")[0])] ?? ""} {toArabicDigits(k.split(":")[1])}</p>
                </div>
                <button type="button" aria-label="تحريك للأعلى" onClick={() => move(i, -1)} className="grid size-9 place-items-center rounded-lg hover:bg-navy-700"><ArrowUp className="size-4" /></button>
                <button type="button" aria-label="تحريك للأسفل" onClick={() => move(i, 1)} className="grid size-9 place-items-center rounded-lg hover:bg-navy-700"><ArrowDown className="size-4" /></button>
                <button type="button" aria-label="إزالة الآية" onClick={() => remove(k)} data-testid={`studio-remove-${k.replace(":", "-")}`} className="grid size-9 place-items-center rounded-lg text-ink-soft hover:bg-danger/20 hover:text-danger"><X className="size-4" /></button>
              </li>
            );
          })}
        </ol>
        <Button className="mt-4 h-11 w-full" disabled={!selectedKeys.length} onClick={onNext} data-testid="studio-verses-next">التالي: اختيار القارئ</Button>
      </section>
    </div>
  );
}

function AddRow({ v, name, added, onAdd, onRemove }: { v: Verse; name: string; added: boolean; onAdd: () => void; onRemove?: () => void }) {
  return (
    <li className={cn("flex items-start gap-3 rounded-xl border p-3", added ? "border-action/60 bg-action/10" : "border-line bg-navy-900")}>
      <button type="button" onClick={added ? onRemove : onAdd} aria-pressed={added} data-testid={`studio-pick-${v.key.replace(":", "-")}`}
        className={cn("mt-1 grid size-7 shrink-0 place-items-center rounded-md border transition-colors", added ? "border-action bg-action text-white" : "border-line hover:border-ink-muted")}
        aria-label={added ? "إزالة من الاختيار" : "إضافة الآية"}>
        {added ? "✓" : <Plus className="size-4" />}
      </button>
      <div className="min-w-0">
        <p className="quran-text text-xl leading-[2.1]">{v.text} <span className="text-gold">{verseMarker(v.number)}</span></p>
        <p className="text-xs text-gold">{name}</p>
      </div>
    </li>
  );
}

function FromSurah({ names, selected, onAdd, onRemove }: { names: Record<number, string>; selected: string[]; onAdd: (k: string[]) => void; onRemove: (k: string) => void }) {
  const [ch, setCh] = useState(1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const { data, isLoading, isError, refetch } = useChapter(ch);
  const max = data?.chapter.verses_count ?? 1;
  return (
    <div className="space-y-3">
      <Select value={String(ch)} onValueChange={(v: string) => { setCh(Number(v)); setFrom(1); setTo(1); }}>
        <SelectTrigger className="h-11 w-full" data-testid="studio-surah-select" aria-label="السورة">
          <SelectValue>{(v) => `${toArabicDigits(v as string)}. سورة ${names[Number(v)] ?? ""}`}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {Object.entries(names).map(([id, n]) => <SelectItem key={id} value={id}>{toArabicDigits(id)}. سورة {n}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="flex flex-wrap items-end gap-2 rounded-xl bg-navy-900 p-3 text-sm">
        <label className="space-y-1">من الآية<input type="number" min={1} max={max} value={from} onChange={(e) => setFrom(Number(e.target.value))} className="block h-10 w-20 rounded-lg border border-line bg-navy-950 px-2" data-testid="studio-range-from" /></label>
        <label className="space-y-1">إلى الآية<input type="number" min={1} max={max} value={to} onChange={(e) => setTo(Number(e.target.value))} className="block h-10 w-20 rounded-lg border border-line bg-navy-950 px-2" data-testid="studio-range-to" /></label>
        <Button variant="outline" className="h-10" data-testid="studio-range-add" onClick={() => {
          const a = Math.max(1, Math.min(from, to)); const b = Math.min(max, Math.max(from, to));
          onAdd(Array.from({ length: b - a + 1 }, (_, i) => `${ch}:${a + i}`));
        }}>إضافة النطاق</Button>
      </div>
      {isLoading && <LoadingBlock />}
      {isError && <ErrorBlock message="تعذّر تحميل السورة." onRetry={() => refetch()} />}
      <ul className="max-h-[420px] space-y-2 overflow-y-auto pe-1">
        {data?.verses.map((v) => (
          <AddRow key={v.key} v={v} name={`${names[ch] ?? ""} ${toArabicDigits(v.number)}`} added={selected.includes(v.key)} onAdd={() => onAdd([v.key])} onRemove={() => onRemove(v.key)} />
        ))}
      </ul>
    </div>
  );
}

function FromSearch({ names, selected, onAdd }: { names: Record<number, string>; selected: string[]; onAdd: (k: string[]) => void }) {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const { data, isFetching } = useSearch(q, null);
  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(input.trim()); }}>
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="ابحث عن الآيات…" className="h-11" data-testid="studio-search-input" aria-label="بحث في الآيات" />
        <Button type="submit" className="h-11" data-testid="studio-search-submit">بحث</Button>
      </form>
      {isFetching && <LoadingBlock />}
      {data && <p className="text-sm text-ink-soft">{toArabicDigits(data.total)} نتيجة</p>}
      <ul className="max-h-[420px] space-y-2 overflow-y-auto">
        {data?.results.map((v) => <AddRow key={v.key} v={v} name={`${names[v.chapter] ?? ""} ${toArabicDigits(v.number)}`} added={selected.includes(v.key)} onAdd={() => onAdd([v.key])} />)}
      </ul>
    </div>
  );
}

function FromTopic({ names, selected, onAdd }: { names: Record<number, string>; selected: string[]; onAdd: (k: string[]) => void }) {
  const { data: topics } = useTopics();
  const [id, setId] = useState<string | null>(null);
  const { data, isLoading } = useTopic(id);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {topics?.map((t) => (
          <button key={t.id} type="button" onClick={() => setId(t.id)} data-testid={`studio-topic-${t.id}`}
            className={cn("min-h-10 rounded-full border px-4 text-sm", id === t.id ? "border-gold bg-gold/15 text-gold" : "border-line text-ink-soft hover:text-ink")}>{t.name}</button>
        ))}
      </div>
      {isLoading && <LoadingBlock />}
      {data && (
        <>
          <p className="text-xs text-ink-muted">{data.note}</p>
          <Button variant="outline" onClick={() => onAdd(data.verse_keys)} data-testid="studio-topic-add-all">إضافة كل آيات «{data.name}»</Button>
          <ul className="max-h-[420px] space-y-2 overflow-y-auto">
            {data.verses.map((v) => <AddRow key={v.key} v={v} name={`${names[v.chapter] ?? ""} ${toArabicDigits(v.number)}`} added={selected.includes(v.key)} onAdd={() => onAdd([v.key])} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function FromRandom({ names, onAdd }: { names: Record<number, string>; onAdd: (k: string[]) => void }) {
  const [seen, setSeen] = useState<string[]>([]);
  const m = useMutation({ mutationFn: () => fetchRandomVerse(seen), onSuccess: (v) => setSeen((s) => [...s, v.key]) });
  return (
    <div className="space-y-3">
      <Button onClick={() => m.mutate()} disabled={m.isPending} className="h-11 border border-gold bg-transparent text-gold hover:bg-gold/10" data-testid="studio-random-button">
        <Shuffle className="size-4" /> اختيار آية عشوائية
      </Button>
      {m.isError && <ErrorBlock message="تعذّر جلب آية." onRetry={() => m.mutate()} />}
      {m.data && (
        <ul><AddRow v={m.data} name={`${names[m.data.chapter] ?? ""} ${toArabicDigits(m.data.number)}`} added={false} onAdd={() => onAdd([m.data!.key])} /></ul>
      )}
    </div>
  );
}
