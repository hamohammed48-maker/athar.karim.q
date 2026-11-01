import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { BookOpen, Clapperboard, Home, Library, Search, Settings } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/brand/Logo";
import { QuranAudioBar } from "@/components/quran/QuranAudioBar";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home, id: "home", end: true },
  { to: "/quran", label: "القرآن الكريم", icon: BookOpen, id: "quran", end: false },
  { to: "/studio", label: "الاستوديو", icon: Clapperboard, id: "studio", end: false },
  { to: "/library", label: "مكتبتي", icon: Library, id: "library", end: false },
];

export default function AppShell() {
  const { pathname } = useLocation();
  const inStudio = pathname.startsWith("/studio");

  useEffect(() => {
    const boot = document.getElementById("boot");
    if (boot) {
      boot.style.opacity = "0";
      const t = setTimeout(() => boot.remove(), 400);
      return () => clearTimeout(t);
    }
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);

  return (
    <div className="min-h-dvh bg-navy-950 text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[60] focus:rounded-lg focus:bg-action focus:px-4 focus:py-2">
        تخطَّ إلى المحتوى
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-navy-950/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="أثر كريم — الرئيسية" data-testid="header-home-link">
            <Logo compact />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="التنقل الرئيسي">
            {NAV.map((n) => (
              <NavLink
                key={n.id}
                to={n.to}
                end={n.end}
                data-testid={`desktop-nav-${n.id}`}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-lg px-4 py-2 text-[15px] transition-colors duration-200",
                    isActive ? "bg-navy-800 text-ink shadow-[inset_0_-2px_0_#E7B85C]" : "text-ink-soft hover:bg-navy-800/60 hover:text-ink",
                  )
                }
              >
                <n.icon className="size-4" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <Link to="/quran/discover" aria-label="البحث في القرآن" data-testid="header-search-button"
              className="grid size-11 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-navy-800 hover:text-ink">
              <Search className="size-5" />
            </Link>
            <Link to="/settings" aria-label="الإعدادات" data-testid="header-settings-button"
              className="grid size-11 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-navy-800 hover:text-ink">
              <Settings className="size-5" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className={cn("pb-28 md:pb-12", !inStudio && "pb-72 md:pb-28")}>
        <Outlet />
      </main>

      {!inStudio && <QuranAudioBar />}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-navy-950/95 backdrop-blur-xl pb-safe md:hidden" aria-label="التنقل السفلي">
        <div className="mx-auto grid h-16 max-w-md grid-cols-4">
          {NAV.map((n) => (
            <NavLink key={n.id} to={n.to} end={n.end} data-testid={`nav-${n.id}-button`}
              className={({ isActive }) =>
                cn("flex flex-col items-center justify-center gap-1 text-xs transition-colors", isActive ? "text-gold" : "text-ink-soft hover:text-ink")
              }>
              {({ isActive }) => (
                <>
                  <n.icon className="size-5" aria-hidden />
                  <span className={cn(isActive && "font-semibold")}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <Toaster position="bottom-right" richColors dir="rtl" />
    </div>
  );
}
