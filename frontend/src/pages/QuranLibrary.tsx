import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Compass, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ErrorBlock, LoadingBlock, Octagon, PageHeader } from "@/components/shared/ui-kit";
import { playVerses } from "@/lib/audio/playVerses";
import { useChapters } from "@/lib/quran/hooks";
import { normalizeArabic, revelationLabel, toArabicDigits } from "@/lib/quran/format";

export default function QuranLibrary() {
  const { data, isLoading, isError, refetch } = useChapters();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = normalizeArabic(q);
    if (!data) return [];
    if (!n) return data;
    return data.filter((c) => normalizeArabic(c.name_arabic).includes(n) || c.name_simple.toLowerCase().includes(n) || String(c.id) === n);
  }, [data, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
      <PageHeader title="القرآن الكريم" subtitle="١١٤ سورة — اختر سورة للقراءة والاستماع"
        action={<Link to="/quran/discover" className="flex h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm text-gold hover:bg-navy-800" data-testid="library-discover-link"><Compass className="size-4" /> اكتشاف الآيات</Link>} />
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن سورة بالاسم أو الرقم…" className="h-12 ps-11 text-base" data-testid="surah-search-input" aria-label="البحث عن سورة" />
      </div>
      {q && (
        <Link to={`/quran/discover?q=${encodeURIComponent(q)}`} className="mb-4 inline-block text-sm text-gold hover:underline" data-testid="library-search-verses-link">
          ابحث عن «{q}» في نص الآيات ←
        </Link>
      )}
      {isLoading && <LoadingBlock label="جارٍ تحميل فهرس السور…" />}
      {isError && <ErrorBlock message="تعذّر تحميل فهرس السور. تحقّق من الاتصال." onRetry={() => refetch()} />}
      {data && list.length === 0 && <p className="py-8 text-center text-ink-soft" data-testid="surah-no-results">لا توجد سورة بهذا الاسم.</p>}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-line bg-navy-900 p-3 transition-colors hover:border-ink-muted hover:bg-navy-800" data-testid={`surah-item-card-${c.id}`}>
            <Octagon n={toArabicDigits(c.id)} />
            <Link to={`/quran/${c.id}`} className="min-w-0 flex-1 py-1" data-testid={`surah-open-${c.id}`}>
              <p className="font-quran text-2xl leading-snug">سورة {c.name_arabic}</p>
              <p className="text-sm text-ink-soft">{revelationLabel(c.revelation_place)} · {toArabicDigits(c.verses_count)} آية · {c.name_simple}</p>
            </Link>
            <button type="button" aria-label={`استماع إلى سورة ${c.name_arabic}`} data-testid={`surah-play-${c.id}`}
              onClick={() => void playVerses(Array.from({ length: c.verses_count }, (_, i) => `${c.id}:${i + 1}`))}
              className="grid size-11 place-items-center rounded-full text-ink-soft transition-colors hover:bg-action hover:text-white">
              <Play className="size-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
