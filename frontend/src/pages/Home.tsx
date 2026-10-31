import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Bookmark, ChevronLeft, Clapperboard, FolderClock, Heart, LayoutTemplate, Plus, Settings } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { buttonVariants } from "@/components/ui/button";
import { getReadPosition } from "@/lib/settings";
import { useProjects } from "@/lib/persistence/stores";
import { toArabicDigits } from "@/lib/quran/format";
import { cn } from "@/lib/utils";

export default function Home() {
  const navigate = useNavigate();
  const pos = getReadPosition();
  const { data: projects } = useProjects();
  const recent = projects?.[0];

  return (
    <div className="animate-fade-up">
      <section className="relative isolate overflow-hidden" data-testid="home-hero-section">
        <img src="/backgrounds/mosque-sunset.jpg" alt="" className="absolute inset-0 -z-20 size-full object-cover object-[50%_70%]" />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(7,24,39,0.35)_0%,rgba(7,24,39,0.7)_55%,#071827_100%)]" />
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-4 px-4 pb-16 pt-16 sm:px-6 sm:pt-24 md:pb-24">
          <LogoMark className="size-16 sm:size-20" />
          <h1 className="font-quran text-6xl leading-tight text-gold sm:text-7xl" data-testid="home-app-name">أثر كريم</h1>
          <p className="text-xl text-ink sm:text-2xl" data-testid="home-tagline">آياتٌ تُتلى، وأثرٌ يبقى.</p>
        </div>
      </section>

      <section className="mx-auto -mt-8 grid max-w-7xl grid-cols-1 gap-6 px-4 sm:px-6 md:grid-cols-2">
        <article className="group relative overflow-hidden rounded-3xl border border-line bg-navy-800 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] sm:p-8" data-testid="home-goto-quran-card">
          <div className="geo-pattern absolute inset-0 -z-0 opacity-60" aria-hidden />
          <div className="relative space-y-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-gold/15 text-gold"><BookOpen className="size-7" /></div>
            <h2 className="text-2xl font-bold sm:text-3xl">القرآن الكريم</h2>
            <p className="max-w-md text-ink-soft">قراءة القرآن الكريم والاستماع إلى التلاوات واكتشاف الآيات.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link to="/quran" className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")} data-testid="home-open-quran-button">فتح المصحف</Link>
              {pos && (
                <Link to={`/quran/${pos.chapter}?verse=${pos.verse}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")} data-testid="home-continue-reading-button">
                  متابعة القراءة: {pos.name} {toArabicDigits(pos.verse)}
                </Link>
              )}
              <Link to="/quran/discover" className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-4 text-gold")} data-testid="home-discover-button">
                اكتشف الآيات <ChevronLeft className="size-4" />
              </Link>
            </div>
          </div>
        </article>

        <article className="relative overflow-hidden rounded-3xl border border-line bg-navy-800 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] sm:p-8" data-testid="home-goto-studio-card">
          <img src="/backgrounds/thumb-mountains.jpg" alt="" className="absolute -left-10 -top-10 h-56 w-40 rotate-6 rounded-2xl object-cover opacity-25" aria-hidden />
          <div className="relative space-y-4">
            <div className="grid size-14 place-items-center rounded-2xl bg-action/20 text-[#93C5FD]"><Clapperboard className="size-7" /></div>
            <h2 className="text-2xl font-bold sm:text-3xl">استوديو القرآن الكريم</h2>
            <p className="max-w-md text-ink-soft">صمّم فيديوهات قرآنية بخلفيات جميلة وخطوط وتأثيرات احترافية.</p>
            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" onClick={() => navigate(`/studio/edit?new=${Date.now()}`)} className={cn(buttonVariants({ size: "lg" }), "h-11 px-5")} data-testid="home-new-video-button">
                <Plus className="size-4" /> فيديو جديد
              </button>
              <Link to="/studio" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11 px-5")} data-testid="home-open-studio-button">فتح الاستوديو</Link>
              {recent && (
                <Link to={`/studio/edit?project=${recent.id}`} className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-11 px-4 text-gold")} data-testid="home-continue-project-button">
                  متابعة: {recent.name}
                </Link>
              )}
            </div>
          </div>
        </article>
      </section>

      <nav className="mx-auto mt-8 grid max-w-7xl grid-cols-2 gap-3 px-4 sm:grid-cols-4 sm:px-6" aria-label="اختصارات">
        {[
          { to: "/library?tab=favorites", label: "المفضلة", icon: Heart, id: "favorites" },
          { to: "/library?tab=templates", label: "نماذجي المحفوظة", icon: LayoutTemplate, id: "templates" },
          { to: "/library?tab=projects", label: "المشاريع الأخيرة", icon: FolderClock, id: "projects" },
          { to: "/settings", label: "الإعدادات", icon: Settings, id: "settings" },
        ].map((s) => (
          <Link key={s.id} to={s.to} data-testid={`home-shortcut-${s.id}`}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-navy-900 px-4 text-sm text-ink-soft transition-colors hover:border-ink-muted hover:text-ink">
            <s.icon className="size-5 text-gold" aria-hidden /> {s.label}
          </Link>
        ))}
      </nav>
      <p className="mx-auto mt-10 flex max-w-7xl items-center gap-2 px-4 text-xs text-ink-muted sm:px-6">
        <Bookmark className="size-3.5" /> نص القرآن والترجمة والتلاوات مقدّمة من Quran.com (Quran Foundation). مشاريعك ونماذجك محفوظة على هذا الجهاز فقط.
      </p>
    </div>
  );
}
