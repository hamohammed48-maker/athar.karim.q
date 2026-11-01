import { Routes, Route, Link } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Home from "@/pages/Home";
import QuranLibrary from "@/pages/QuranLibrary";
import QuranReader from "@/pages/QuranReader";
import Discovery from "@/pages/Discovery";
import StudioHome from "@/pages/StudioHome";
import StudioEditor from "@/pages/StudioEditor";
import LibraryPage from "@/pages/Library";
import SettingsPage from "@/pages/Settings";
import LocalStoragePage from "@/pages/LocalStorage";

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-2xl font-bold">الصفحة غير موجودة</p>
      <Link to="/" className="mt-4 inline-block text-gold hover:underline" data-testid="notfound-home-link">العودة إلى الرئيسية</Link>
    </div>
  );
}

// One <Route> per page in src/pages; BrowserRouter already wraps this in main.tsx.
export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/quran" element={<QuranLibrary />} />
        <Route path="/quran/discover" element={<Discovery />} />
        <Route path="/quran/:chapter" element={<QuranReader />} />
        <Route path="/studio" element={<StudioHome />} />
        <Route path="/studio/edit" element={<StudioEditor />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/storage" element={<LocalStoragePage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
