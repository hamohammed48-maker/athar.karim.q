# أثر كريم — Athar Kareem

> آياتٌ تُتلى، وأثرٌ يبقى.

Arabic-first (RTL, dark) Quran reader + Quranic video studio. Two primary sections only:
**القرآن الكريم** and **استوديو القرآن الكريم**; secondary: مكتبتي (favorites / saved templates / recent projects) and الإعدادات.

## 1. Architecture overview

| Layer | Where | Notes |
|---|---|---|
| Quran data proxy + cache | `backend/lib/quran_source.py`, `backend/routers/quran.py` | FastAPI fetches Quran.com API v4 / QDC audio API server-side. It uses only a short-lived in-process memory cache (6-day TTL); there is no server database and no all-chapter warm-up. The installed app stores downloaded chapters in its own IndexedDB. |
| Search normalisation | `backend/lib/arabic.py` | Separate `norm` field (from `text_imlaei_simple`, diacritics stripped, alef/ya/ta-marbuta unified). Displayed text (`text_uthmani`) is never altered. |
| Topics | `backend/lib/topics.py` | Curated editorial verse-key lists, every topic flagged `complete=false` + note (not tafsir, not AI). |
| Typed fetch | `frontend/src/types/quran.ts` ↔ `backend/models/quran.py` | Hand-mirrored interfaces; TanStack Query hooks in `src/lib/quran/hooks.ts`. |
| Audio | `src/lib/audio/player.ts` | `RecitationPlayer`: plays verse slices of chapter audio files on one `<audio>` element (CDN sends CORS `*` + Range). Verse/word state is derived from `audio.currentTime` + real Quran.com segments → seeking stays in sync. |
| Rendering | `src/lib/rendering/renderer.ts` | One pure `renderFrame(ctx, W, H, design, frame, assets)` used by the live preview, template previews and the exporter (no duplicated styling logic). Layout is resolution-independent (unit = min(W,H)/1080), auto-fits by shrinking font (never distorting glyphs). |
| Design model | `src/lib/rendering/design.ts` | Versioned `DesignSettings` (v1), 3 built-in templates, `sanitizeDesign()` whitelist/clamp validator for imported data. |
| Export | `src/lib/export/exporter.ts` | Canvas `captureStream(30)` + Web Audio `MediaStreamDestination` → `MediaRecorder`. MP4 (H.264/AAC) when `isTypeSupported`, otherwise WebM (VP9/VP8+Opus). Real-time, real progress (audio position / total), cancellable. |
| Persistence | `src/lib/persistence/idb.ts`, `stores.ts`, `src/lib/offlineChapters.ts` | IndexedDB stores: `favorites`, `templates`, `projects`, `media`, and `offline-content` (one record per downloaded chapter plus chapter/topic indexes). Small prefs + last read position in localStorage. |
| Media | `src/lib/media/background.ts` | Validates type/size (JPG/PNG/WEBP ≤20 MB, MP4/WEBM/MOV ≤150 MB), loads exactly one background at a time, revokes object URLs / releases video decoders on switch. |

## 2. Data provenance & licensing
- Quran text: Quran.com API v4 (`text_uthmani`), Quran Foundation. Translation: Saheeh International (resource id 20). Attribution shown in Settings → About and on Home.
- Not generated or edited by AI. Settings integrity check now validates downloaded chapters locally: verse count, numbering, duplicate keys, Arabic text, words and English translation. It does not claim to validate chapters that have not been downloaded.
- Validation is against Quran.com's own chapter metadata and the canonical totals (114 / 6236); no word-by-word cross-check against a second edition (e.g. Tanzil) was performed.

## 3. Audio sources
- Reciters & chapter audio: `api.qurancdn.com/api/qdc/audio/reciters` (13 reciters, "kids repeat" edition excluded). Files streamed on demand from `download.quranicaudio.com` (host allow-list in backend).
- Word timing: QDC `segments` `[word, start_ms, end_ms]`; malformed entries discarded. If any selected verse lacks segments, the UI states word tracking is unavailable and falls back to verse-level display.

## 4. Video export compatibility
- Chrome/Edge (recent) and Safari: MP4 when the browser's MediaRecorder supports `video/mp4` (verified: Chromium → MP4 720×1280, plays back in `<video>`). Firefox: WebM.
- Resolutions offered: 720p and 1080p only. 4K is intentionally not offered (real-time canvas encoding cannot be guaranteed).
- Export runs in real time (duration = recitation length); keep the tab visible (background tabs throttle rendering). Max 40 verses per project.
- No server-side rendering; user media never leaves the device.

## 5. Offline behaviour (honest)
- Requires network: Quran text for chapters not yet downloaded, recitation audio, first load of the app.
- Works without network once loaded: saved templates, projects, favorites, settings (IndexedDB/localStorage); built-in backgrounds already cached by the browser.
- No service worker / PWA shell caching in this release.

## 6. Testing
- Backend: `cd backend && pytest` → 9 tests (dataset integrity, ordering, invalid refs, search normalisation, random exclusion, topic resolution, reciter timing). Last run: 9 passed.
- Frontend: `cd frontend && yarn typecheck`; Playwright flows exercised: reader → select verses → studio → template → style → export (real MP4 verified 720×1280), template save → reload → persists → duplicate, mobile 390×844 no horizontal overflow.

## 7. Run / deploy
- Dev: backend `uvicorn server:app --port 8001 --reload`, frontend `yarn dev` (port 3000, `/api` proxied).
- Env (`backend/.env`): `CORS_ORIGINS`; optional `QURAN_API_BASE`, `QDC_API_BASE`, and `QF_CLIENT_ID` / `QF_CLIENT_SECRET` / `QF_ENV=production` for Content Sync. No MongoDB or server-side database is used. QF credentials stay only in the hosting environment, never in the APK.
- Backend has no database dependency. Its temporary cache is lost when the process restarts; downloaded chapters remain on the device.

## 8. Known limitations
- Dark theme only; Arabic UI only; one translation (English, Saheeh International).
- Topic lists are small curated selections, not exhaustive.
- WebM output on browsers without MP4 MediaRecorder support.
- Template export (JSON) contains settings only — personal background files are not embedded.
