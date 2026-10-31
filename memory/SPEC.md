# SPEC — أثر كريم (Athar Kareem)

Full docs: /app/ATHAR_KAREEM.md. No login/auth — all user data is local (IndexedDB).

## Routes
- `/` Home (hero, 2 main cards: Quran / Studio, shortcuts). Boot splash in index.html (#boot) removed on mount.
- `/quran` surah list (search by name) · `/quran/:chapter?verse=N` reader (select verses, range, play, favorites, translation toggle, font size, reciter) · `/quran/discover?tab=search|topics|random&topic=id&q=`
- `/studio` studio home (new, from Quran, random, 3 built-in templates, recent projects)
- `/studio/edit?project=id | ?verses=2:153,2:155 | ?template=id[&edit=1] | ?new=<nonce>[&builtin=classic|modern|nature]` → 6-step editor (verses, reciter, template+background, text/effects, preview, export). URL is replaced with `?project=id`.
- `/library?tab=favorites|templates|projects` · `/settings`

## Backend (all under /api/quran)
chapters, chapters/{n}, verses?keys=, search?q=&chapter=, random?exclude=, topics, topics/{id}, reciters, audio/{reciter_id}/{chapter}, integrity.
Mongo collections: meta (chapters, reciters), verses (key unique), chapter_cache, audio_cache — 6-day TTL refresh from Quran.com.

## Local data model (IndexedDB "athar-kareem")
- favorites {key, chapter, number, text, surahName, addedAt}
- templates {id, name, design: DesignSettings v1, thumbnail dataURL, includesMedia, createdAt, updatedAt}
- projects {id, name, verseKeys[], reciterId, design, thumbnail, createdAt, updatedAt} — autosaved 1.2s after change once it has ≥1 verse.
- media {id, blob, type, name, size}
- localStorage: athar.settings.v1, athar.lastRead.v1

## Seed facts
- Quran cache auto-syncs all 114 chapters on backend boot. Default reciter id 7 (Mishari al-Afasy, has word timings). Verse 94:5 = فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا.
