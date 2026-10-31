import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Clapperboard, Copy, Download, FolderClock, Heart, LayoutTemplate, Pencil, Play, Trash2, Upload, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { EmptyBlock, LoadingBlock, PageHeader, Segmented } from "@/components/shared/ui-kit";
import { playVerses } from "@/lib/audio/playVerses";
import { uid, useDeleteProject, useFavorites, useProjects, useRemoveFavorite, useSavedTemplates, useTemplateMutations, type SavedTemplate } from "@/lib/persistence/stores";
import { formatDate, toArabicDigits, verseMarker } from "@/lib/quran/format";
import { sanitizeDesign } from "@/lib/rendering/design";

type Tab = "favorites" | "templates" | "projects";

export default function LibraryPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "favorites";
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
      <PageHeader title="مكتبتي" subtitle="محفوظة على هذا الجهاز وهذا المتصفح فقط — لا تنتقل تلقائياً إلى جهاز آخر." />
      <Segmented<Tab> value={tab} onChange={(t) => setSp({ tab: t }, { replace: true })} testId="library-tabs" label="أقسام المكتبة"
        options={[{ id: "favorites", label: "المفضلة" }, { id: "templates", label: "نماذجي المحفوظة" }, { id: "projects", label: "المشاريع الأخيرة" }]} />
      <div className="mt-6">
        {tab === "favorites" && <Favorites />}
        {tab === "templates" && <Templates />}
        {tab === "projects" && <Projects />}
      </div>
    </div>
  );
}

function Favorites() {
  const { data, isLoading } = useFavorites();
  const remove = useRemoveFavorite();
  if (isLoading) return <LoadingBlock />;
  if (!data?.length) return <EmptyBlock icon={<Heart className="size-6" />} title="لا توجد آيات في المفضلة" hint="اضغط على أيقونة القلب بجانب أي آية لحفظها هنا." action={<Link to="/quran" className="text-gold hover:underline">تصفّح القرآن</Link>} />;
  return (
    <ul className="space-y-3">
      {data.map((f) => (
        <li key={f.key} className="rounded-2xl border border-line bg-navy-900 p-4" data-testid={`favorite-item-${f.key.replace(":", "-")}`}>
          <p className="quran-text text-2xl">{f.text} <span className="text-gold">{verseMarker(f.number)}</span></p>
          <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-3 text-sm">
            <span className="me-auto text-gold">[{f.surahName}: {toArabicDigits(f.number)}]</span>
            <Link to={`/quran/${f.chapter}?verse=${f.number}`} className="rounded-lg px-3 py-2 hover:bg-navy-800" data-testid={`favorite-open-${f.key.replace(":", "-")}`}>فتح</Link>
            <button type="button" onClick={() => void playVerses([f.key])} className="flex items-center gap-1 rounded-lg px-3 py-2 hover:bg-navy-800" data-testid={`favorite-play-${f.key.replace(":", "-")}`}><Play className="size-4" /> استماع</button>
            <Link to={`/studio/edit?verses=${f.key}`} className="flex items-center gap-1 rounded-lg px-3 py-2 text-gold hover:bg-navy-800" data-testid={`favorite-studio-${f.key.replace(":", "-")}`}><Clapperboard className="size-4" /> فيديو</Link>
            <button type="button" onClick={() => remove.mutate(f.key)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-ink-soft hover:text-danger" data-testid={`favorite-remove-${f.key.replace(":", "-")}`}><Trash2 className="size-4" /> إزالة</button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Templates() {
  const navigate = useNavigate();
  const { data, isLoading } = useSavedTemplates();
  const { save, remove } = useTemplateMutations();
  const [renaming, setRenaming] = useState<SavedTemplate | null>(null);
  const [deleting, setDeleting] = useState<SavedTemplate | null>(null);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = (t: SavedTemplate) => {
    const payload = { format: "athar-kareem-template", version: 1, name: t.name, design: t.design, mediaIncluded: false };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${t.name}.athar-template.json`; a.click();
    URL.revokeObjectURL(url);
    if (t.includesMedia) toast.info("صُدّرت الإعدادات فقط؛ ملف الخلفية الشخصي لا يُضمَّن في الملف.");
  };

  const importJson = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200 * 1024) { toast.error("ملف النموذج كبير جداً"); return; }
    try {
      const raw = JSON.parse(await f.text()) as { format?: unknown; name?: unknown; design?: unknown };
      if (raw.format !== "athar-kareem-template") throw new Error("format");
      const design = sanitizeDesign(raw.design); // whitelist + clamp; nothing is executed
      const missing = design.background.kind === "image" || design.background.kind === "video";
      if (missing) design.background = { ...design.background, kind: "builtin", mediaId: null, mediaName: null };
      const now = Date.now();
      await save.mutateAsync({ id: uid(), name: typeof raw.name === "string" ? raw.name.slice(0, 60) : "نموذج مستورد", design, thumbnail: null, includesMedia: false, createdAt: now, updatedAt: now });
      toast.success(missing ? "استُورد النموذج — الخلفية الشخصية غير مضمّنة، اختر خلفية جديدة." : "استُورد النموذج");
    } catch {
      toast.error("ملف غير صالح لنموذج أثر كريم");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate(`/studio/edit?new=${Date.now()}`)} data-testid="templates-new-button"><Wand2 className="size-4" /> تصميم نموذج جديد</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()} data-testid="templates-import-button"><Upload className="size-4" /> استيراد نموذج</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="templates-import-input" onChange={(e) => { void importJson(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {isLoading && <LoadingBlock />}
      {!isLoading && !data?.length && <EmptyBlock icon={<LayoutTemplate className="size-6" />} title="لا توجد نماذج محفوظة" hint="صمّم فيديو في الاستوديو ثم اضغط «حفظ النموذج» لإعادة استخدام التصميم مع آيات أخرى." />}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data?.map((t) => (
          <li key={t.id} className="flex gap-3 rounded-2xl border border-line bg-navy-900 p-3" data-testid={`template-item-${t.id}`}>
            {t.thumbnail ? <img src={t.thumbnail} alt="" className="h-32 w-24 shrink-0 rounded-lg object-cover" /> : <div className="h-32 w-24 shrink-0 rounded-lg bg-navy-800" />}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="truncate font-semibold" data-testid={`template-name-${t.id}`}>{t.name}</p>
              <p className="text-xs text-ink-muted">آخر تعديل: {formatDate(t.updatedAt)}</p>
              {t.includesMedia && <p className="text-xs text-gold">يتضمن خلفية من جهازك</p>}
              <div className="flex flex-wrap gap-1 pt-1">
                <Button size="sm" onClick={() => navigate(`/studio/edit?template=${t.id}`)} data-testid={`template-apply-${t.id}`}>تطبيق</Button>
                <Button size="sm" variant="outline" onClick={() => navigate(`/studio/edit?template=${t.id}&edit=1`)} data-testid={`template-edit-${t.id}`}><Pencil className="size-3.5" /> تعديل</Button>
                <Button size="sm" variant="ghost" aria-label="تكرار" data-testid={`template-duplicate-${t.id}`}
                  onClick={() => save.mutate({ ...t, id: uid(), name: `${t.name} (نسخة)`, createdAt: Date.now(), updatedAt: Date.now() }, { onSuccess: () => toast.success("تم تكرار النموذج") })}><Copy className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="إعادة تسمية" data-testid={`template-rename-${t.id}`} onClick={() => { setRenaming(t); setName(t.name); }}>إعادة تسمية</Button>
                <Button size="sm" variant="ghost" aria-label="تصدير" data-testid={`template-export-${t.id}`} onClick={() => exportJson(t)}><Download className="size-3.5" /></Button>
                <Button size="sm" variant="ghost" aria-label="حذف" className="text-danger" data-testid={`template-delete-${t.id}`} onClick={() => setDeleting(t)}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent dir="rtl" data-testid="template-rename-dialog">
          <DialogHeader><DialogTitle>إعادة تسمية النموذج</DialogTitle></DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-11" data-testid="template-rename-input" aria-label="الاسم الجديد" />
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>إلغاء</Button>
            <Button data-testid="template-rename-confirm" onClick={() => { if (renaming && name.trim()) save.mutate({ ...renaming, name: name.trim(), updatedAt: Date.now() }, { onSuccess: () => { setRenaming(null); toast.success("تمت إعادة التسمية"); } }); }}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent dir="rtl" data-testid="template-delete-dialog">
          <DialogHeader><DialogTitle>حذف النموذج؟</DialogTitle><DialogDescription>سيُحذف «{deleting?.name}» نهائياً من هذا الجهاز.</DialogDescription></DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>إلغاء</Button>
            <Button variant="destructive" data-testid="template-delete-confirm" onClick={() => { if (deleting) remove.mutate(deleting.id, { onSuccess: () => { setDeleting(null); toast.success("حُذف النموذج"); } }); }}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Projects() {
  const { data, isLoading } = useProjects();
  const del = useDeleteProject();
  if (isLoading) return <LoadingBlock />;
  if (!data?.length) return <EmptyBlock icon={<FolderClock className="size-6" />} title="لا توجد مشاريع" hint="ابدأ فيديو جديداً من الاستوديو؛ يُحفظ تلقائياً هنا." action={<Link to="/studio" className="text-gold hover:underline">فتح الاستوديو</Link>} />;
  return (
    <ul className="space-y-3">
      {data.map((p) => (
        <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-navy-900 p-3" data-testid={`project-item-${p.id}`}>
          {p.thumbnail ? <img src={p.thumbnail} alt="" className="h-20 w-16 rounded-lg object-cover" /> : <div className="h-20 w-16 rounded-lg bg-navy-800" />}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="text-xs text-ink-muted">{toArabicDigits(p.verseKeys.length)} آيات · {formatDate(p.updatedAt)}</p>
          </div>
          <Link to={`/studio/edit?project=${p.id}`} className="rounded-lg bg-action px-4 py-2 text-sm text-white hover:bg-action-hover" data-testid={`project-open-${p.id}`}>فتح</Link>
          <button type="button" aria-label="حذف المشروع" onClick={() => { if (confirm("حذف هذا المشروع نهائياً؟")) del.mutate(p.id); }} className="grid size-10 place-items-center rounded-lg text-ink-soft hover:text-danger" data-testid={`project-delete-${p.id}`}><Trash2 className="size-4" /></button>
        </li>
      ))}
    </ul>
  );
}
