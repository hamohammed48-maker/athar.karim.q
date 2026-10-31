import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { API_BASE_URL } from './lib/apiConfig'
import { checkAppUpdate } from './lib/appUpdater'
import { toast } from 'sonner'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Check Content Sync at most every six days per installed app.
// A failed attempt is retried after 12 hours; no Quran text is downloaded by this check.
const QURAN_SYNC_CHECK_KEY = "athar.quranSync.lastAttemptAt";
const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;
const RETRY_AFTER_FAILURE = 12 * 60 * 60 * 1000;

const checkQuranSync = () => {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  const now = Date.now();
  let lastAttempt = 0;
  try {
    lastAttempt = Number(localStorage.getItem(QURAN_SYNC_CHECK_KEY) || 0);
  } catch {
    // Continue with a one-off check if localStorage is unavailable.
  }
  if (lastAttempt && now - lastAttempt < SIX_DAYS) return;
  try {
    localStorage.setItem(QURAN_SYNC_CHECK_KEY, String(now));
  } catch {
    // The request still works without a local attempt marker.
  }
  void fetch(API_BASE_URL + "/offline/status", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) {
        try {
          localStorage.setItem(QURAN_SYNC_CHECK_KEY, String(now - SIX_DAYS + RETRY_AFTER_FAILURE));
        } catch {
          // Ignore unavailable localStorage.
        }
      }
    })
    .catch(() => {
      try {
        localStorage.setItem(QURAN_SYNC_CHECK_KEY, String(now - SIX_DAYS + RETRY_AFTER_FAILURE));
      } catch {
        // Ignore unavailable localStorage.
      }
    });
};
checkQuranSync();
window.addEventListener("online", checkQuranSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkQuranSync();
});


// Check for a published Android release on each app launch. Installation always
// requires the user's confirmation in Android's package installer.
void checkAppUpdate().then((update) => {
  try { localStorage.setItem("athar.appUpdate.available.v1", JSON.stringify(update)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("athar-app-update", { detail: update }));
  if (update) {
    toast("يتوفر تحديث جديد لأثر كريم", {
      description: "الإصدار " + update.version + " جاهز للتنزيل من صفحة تحديث التطبيق.",
      action: { label: "عرض", onClick: () => { window.location.href = "/settings#app-update"; } },
      duration: 10000,
    });
  }
}).catch(() => {
  // Offline launch is expected; manual checking remains available in Settings.
});
