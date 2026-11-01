import { useEffect, useRef } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from "react-router-dom";
import { BookOpen, Clapperboard, Home, Library, Search, Settings } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Logo } from "@/components/brand/Logo";
import { QuranAudioBar } from "@/components/quran/QuranAudioBar";
import { cn } from "@/lib/utils";

const BackNavigation = registerPlugin<{ exitApp(): Promise<void> }>("BackNavigation");

const NAV = [
  { to: "/", label: "الرئيسية", icon: Home, id: "home", end: true },
  { to: "/quran", label: "القرآن الكريم", icon: BookOpen, id: "quran", end: false },
  { to: "/studio", label: "الاستوديو", icon: Clapperboard, id: "studio", end: false },
  { to: "/library", label: "مكتبتي", icon: Library, id: "library", end: false },
];

type HistoryEntry = { key: string; pathname: string; search: string; hash: string };

function sectionFor(pathname: string): string {
  if (pathname === "/" ) return "home";
  if (pathname.startsWith("/quran")) return "quran";
  if (pathname.startsWith("/studio")) return "studio";
  if (pathname.startsWith("/library")) return "library";
  if (pathname.startsWith("/settings")) return "settings";
  return "other";
}

function parentRoute(pathname: string): string | null {
  if (pathname === "/quran/discover" || /^\/quran\/[^/]+$/.test(pathname)) return "/quran";
  if (pathname === "/studio/edit") return "/studio";
  return null;
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { pathname } = location;
  const inStudio = pathname.startsWith("/studio");
  // Keep a separate navigation stack for each top-level section. Switching tabs
  // must never add the previous section to the current section's back history.
  const sectionHistory = useRef(new Map<string, HistoryEntry[]>());
  const activeSection = useRef(sectionFor(location.pathname));
  const initialEntry: HistoryEntry = {
    key: location.key, pathname: location.pathname, search: location.search, hash: location.hash,
  };
  sectionHistory.current.set(activeSection.current, [initialEntry]);

  useEffect(() => {
    const current: HistoryEntry = {
      key: location.key, pathname: location.pathname, search: location.search, hash: location.hash,
    };
    const section = sectionFor(location.pathname);
    // A transition between top-level sections starts/continues that section's
    // own history; it is never recorded as a child navigation in another section.
    if (activeSection.current !== section) {
      activeSection.current = section;
      sectionHistory.current.set(section, [current]);
      return;
    }

    const stack = sectionHistory.current.get(section) ?? [current];
    sectionHistory.current.set(section, stack);
    if (navigationType === "PUSH") {
      if (stack[stack.length - 1]?.key !== current.key) stack.push(current);
    } else if (navigationType === "REPLACE") {
      if (stack.length) stack[stack.length - 1] = current;
      else stack.push(current);
    } else {
      const existingIndex = stack.findIndex((entry) => entry.key === current.key);
      if (existingIndex >= 0) stack.splice(existingIndex + 1);
      else {
        stack.length = 0;
        stack.push(current);
      }
    }
  }, [location.key, location.pathname, location.search, location.hash, navigationType]);

  useEffect(() => {
    const handleAndroidBack = () => {
      // Native dialogs and sheets get first refusal; Escape is the standard Radix close path.
      const openOverlay = document.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-radix-popper-content-wrapper] [data-state="open"]'
      );
      if (openOverlay) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
        return;
      }

      // Give the active feature (for example, the Studio wizard) a chance to go back internally.
      const backRequest = new CustomEvent("athar:back-request", { cancelable: true });
      window.dispatchEvent(backRequest);
      if (backRequest.defaultPrevented) return;

      const currentPath = window.location.pathname;
      const section = sectionFor(currentPath);
      const stack = sectionHistory.current.get(section) ?? [];
      if (stack.length > 1) {
        // Go back only within the active section.
        navigate(-1);
        return;
      }

      // If a nested page was opened directly (without an in-app history entry),
      // return to its parent inside the same section.
      const parent = parentRoute(currentPath);
      if (parent) {
        navigate(parent, { replace: true });
        return;
      }

      // Once the active section reaches its own root, the next back action
      // returns to the app home. It must never jump to another section's history.
      if (section !== "home") {
        navigate("/", { replace: true });
        return;
      }

      if (Capacitor.isNativePlatform()) {
        void BackNavigation.exitApp().catch(() => undefined);
      }
    };

    window.addEventListener("athar:android-back", handleAndroidBack);
    return () => window.removeEventListener("athar:android-back", handleAndroidBack);
  }, [navigate]);

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
