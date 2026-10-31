import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, FolderClock, LayoutTemplate, Plus, Shuffle, Trash2 } from "lucide-react";
import { EmptyBlock, PageHeader } from "@/components/shared/ui-kit";
import { TemplatePreview } from "@/components/studio/StudioCanvas";
import { useDeleteProject, useProjects, useSavedTemplates } from "@/lib/persistence/stores";
import { fetchRandomVerse, useVersesByKeys } from "@/lib/quran/hooks";
import { formatDate, toArabicDigits } from "@/lib/quran/format";
import { BUILTIN_TEMPLATES } from "@/lib/rendering/design";

export default function StudioHome() {
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const { data: templates } = useSavedTemplates();
  const del = useDeleteProject();
  const sample = useVersesByKeys(["94:5"]).data?.[0] ?? null;
  const random = useMutation({
    mutationFn: () => fetchRandomVerse([]),
    onSuccess: (v) => navigate(`/studio/edit?verses=${v.key}`),
    onError: () => toast.error("تعذّر جلب آية عشوائية"),
  });
  const action = "flex min-h-24 flex-col items-start justify-between gap-3 rounded-2xl border border-line bg-navy-900 p-4 text-start transition-colors hover:border-gold/60 hover:bg-navy-800";

  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6" data-testid="studio-home">
      <PageHeader title="استوديو القرآن الكريم" subtitle="من الآية إلى فيديو جاهز للمشاركة: اختر الآيات، القارئ، التصميم، ثم صدّر." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <button type="button" className={`${action} border-action/60 bg-action/15`} onClick={() => navigate(`/studio/edit?new=${Date.now()}`)} data-testid="studio-home-new">
          <Plus className="size-6 text-[#93C5FD]" /><span className="font-semibold">إنشاء فيديو جديد</span>
        </button>
        <Link to="/quran" className={action} data-testid="studio-home-from-quran"><BookOpen className="size-6 text-gold" /><span className="font-semibold">اختيار آيات من القرآن</span></Link>
        <button type="button" className={action} onClick={() => random.mutate()} disabled={random.isPending} data-testid="studio-home-random">
          <Shuffle className="size-6 text-gold" /><span className="font-semibold">{random.isPending ? "جارٍ الاختيار…" : "آية عشوائية"}</span>
        </button>
        <Link to="/library?tab=templates" className={action} data-testid="studio-home-saved-templates"><LayoutTemplate className="size-6 text-gold" /><span className="font-semibold">نماذجي المحفوظة ({toArabicDigits(templates?.length ?? 0)})</span></Link>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-bold">النماذج الجاهزة</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-6 lg:max-w-3xl">
          {BUILTIN_TEMPLATES.map((t) => (
            <button key={t.id} type="button" onClick={() => navigate(`/studio/edit?new=${Date.now()}&builtin=${t.id}`)} data-testid={`studio-home-template-${t.id}`}
              className="space-y-2 rounded-2xl border border-line bg-navy-900 p-2 text-start transition-colors hover:border-gold">
              <TemplatePreview design={t.design} verse={sample} surahName="الشرح" testId={`studio-home-template-preview-${t.id}`} />
              <span className="block px-1 text-sm font-semibold">{t.name}</span>
              <span className="block px-1 pb-1 text-xs text-ink-muted">{t.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold"><FolderClock className="size-5 text-gold" /> مشاريعي الأخيرة</h2>
        {!projects?.length ? (
          <EmptyBlock icon={<FolderClock className="size-6" />} title="لا توجد مشاريع بعد" hint="تُحفظ مشاريعك تلقائياً على هذا الجهاز بمجرد اختيار الآيات." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {projects.slice(0, 10).map((p) => (
              <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-navy-900" data-testid={`studio-recent-project-${p.id}`}>
                <Link to={`/studio/edit?project=${p.id}`} className="block">
                  {p.thumbnail ? <img src={p.thumbnail} alt="" className="aspect-[3/4] w-full object-cover" /> : <div className="aspect-[3/4] bg-navy-800" />}
                  <div className="p-2">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-ink-muted">{toArabicDigits(p.verseKeys.length)} آيات · {formatDate(p.updatedAt)}</p>
                  </div>
                </Link>
                <button type="button" onClick={() => { if (confirm("حذف هذا المشروع نهائياً؟")) del.mutate(p.id); }} className="flex w-full items-center justify-center gap-1 border-t border-line py-2 text-xs text-ink-soft hover:text-danger" data-testid={`studio-recent-delete-${p.id}`}>
                  <Trash2 className="size-3.5" /> حذف
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
