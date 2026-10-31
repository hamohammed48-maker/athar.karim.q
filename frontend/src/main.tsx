import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { queryClient } from './lib/queryClient'
import { maybeSyncOfflineQuranBundle } from './lib/offlineContent'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

// Keep a downloaded Quran copy current when the backend and Quran Foundation are reachable.
const checkOfflineQuranSync = () => void maybeSyncOfflineQuranBundle();
checkOfflineQuranSync();
window.addEventListener("online", checkOfflineQuranSync);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkOfflineQuranSync();
});
// Also check while the app remains open for several days.
window.setInterval(checkOfflineQuranSync, 12 * 60 * 60 * 1000);
