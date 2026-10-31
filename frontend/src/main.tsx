import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { API_BASE_URL } from './lib/apiConfig'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Trigger a lightweight Content Sync check. It returns metadata only, never Quran text.
const checkQuranSync = () => {
  if (typeof navigator === "undefined" || !navigator.onLine) return;
  void fetch(API_BASE_URL + "/offline/status", { cache: "no-store" }).catch(() => undefined);
};
checkQuranSync();
window.addEventListener("online", checkQuranSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkQuranSync();
});
window.setInterval(checkQuranSync, 12 * 60 * 60 * 1000);
