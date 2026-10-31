"""Quran Foundation Content Sync adapter for on-device offline reading.

QF credentials stay on the backend. The app requests this endpoint on first setup
and stores the returned Content Sync copy in its own IndexedDB. No QF content is
prepackaged into the APK.
"""
from __future__ import annotations

import copy
import os
import re
import threading
from datetime import datetime, timedelta, timezone

import httpx

from lib.topics import TOPICS, TOPIC_NOTE

EXPECTED_CHAPTERS = 114
EXPECTED_VERSES = 6236
EXPECTED_WORDS = 83665
MUSHAF_ID = 4
TRANSLATION_MATCH = "saheeh international"
SYNC_INTERVAL = timedelta(days=6)


class QuranFoundationError(RuntimeError):
    pass


class QuranFoundationClient:
    def __init__(self, client_id: str, client_secret: str, environment: str):
        if environment not in {"production", "prelive"}:
            raise ValueError("QF_ENV must be production or prelive")
        if environment == "prelive":
            self.auth_url = "https://prelive-oauth2.quran.foundation/oauth2/token"
            self.content_root = "https://apis-prelive.quran.foundation/content"
        else:
            self.auth_url = "https://oauth2.quran.foundation/oauth2/token"
            self.content_root = "https://apis.quran.foundation/content"
        self.client_id = client_id
        self.api_base = self.content_root + "/api/v4"
        self.http = httpx.Client(timeout=90, follow_redirects=True)
        response = self.http.post(
            self.auth_url,
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials", "scope": "content"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        self.token = response.json()["access_token"]
        self.headers = {"x-auth-token": self.token, "x-client-id": client_id}

    def get(self, url_or_path: str, params: dict | None = None) -> dict:
        if url_or_path.startswith("https://"):
            url = url_or_path
        elif url_or_path.startswith("/api/v4/"):
            url = self.content_root + url_or_path
        else:
            url = self.api_base + "/" + url_or_path.lstrip("/")
        response = self.http.get(url, params=params, headers=self.headers)
        response.raise_for_status()
        payload = response.json()
        if isinstance(payload, dict) and payload.get("success") is False:
            raise QuranFoundationError(payload.get("message", "Quran Foundation request failed"))
        return payload

    def close(self) -> None:
        self.http.close()


def _label(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _find_saheeh_translation(client: QuranFoundationClient) -> dict:
    payload = client.get("resources/translations", {"language": "en"})
    matches = []
    for item in payload.get("translations", []):
        labels = " ".join(str(item.get(k) or "") for k in ("name", "author_name", "slug", "translated_name"))
        if TRANSLATION_MATCH in _label(labels):
            matches.append(item)
    if len(matches) != 1:
        raise QuranFoundationError(
            "لم يتم العثور على مورد عام واحد محدد باسم Saheeh International في فهرس Quran Foundation."
        )
    return matches[0]


def _sync_pages(client: QuranFoundationClient, resources_filter: str, sync_token: str | None):
    url = client.api_base + "/resources/sync"
    params = {
        "resources": resources_filter,
        "per_page": 100,
    }
    if sync_token:
        params["sync_token"] = sync_token
    else:
        params["bootstrap"] = "true"

    mutations = []
    final_token = ""
    while True:
        page = client.get(url, params=params)
        params = None
        sync = page.get("sync", page)
        mutations.extend(sync.get("mutations", []))
        if not sync.get("has_more", False):
            final_token = sync.get("next_sync_token") or ""
            break
        url = sync.get("next_page_url") or ""
        if not url:
            raise QuranFoundationError("Content Sync returned has_more without a next_page_url.")
    if not final_token:
        raise QuranFoundationError("Content Sync did not return a final sync token.")
    return mutations, final_token


def _fetch_snapshots(client: QuranFoundationClient, translation_id: int) -> dict[str, dict]:
    targets = {
        "quran_core:1": "/api/v4/resources/snapshots/quran_core/1",
        f"mushafs:{MUSHAF_ID}": f"/api/v4/resources/snapshots/mushafs/{MUSHAF_ID}",
        f"translations:{translation_id}": f"/api/v4/resources/snapshots/translations/{translation_id}",
    }
    return {key: client.get(path) for key, path in targets.items()}


def _build_bundle(
    core: dict,
    mushaf: dict,
    translation: dict,
    translation_info: dict,
    resources_filter: str,
    sync_token: str,
) -> dict:
    core_records = core.get("records", [])
    mushaf_records = mushaf.get("records", [])
    translation_records = translation.get("records", [])

    chapters_raw = sorted(
        (r for r in core_records if r.get("record_type") == "chapter"),
        key=lambda r: int(r.get("chapter_number", r.get("id", 0))),
    )
    verses_raw = sorted(
        (r for r in core_records if r.get("record_type") == "verse"),
        key=lambda r: (int(r.get("chapter_id", 0)), int(r.get("verse_number", 0))),
    )
    words_raw = [
        r for r in core_records
        if r.get("record_type") == "word" and r.get("char_type_name") == "word"
    ]
    mushaf_words = {
        int(r["word_id"]): str(r["text"])
        for r in mushaf_records
        if r.get("record_type") == "mushaf_word"
        and r.get("word_id") is not None
        and r.get("text")
    }
    translations_by_key = {
        str(r["verse_key"]): str(r.get("text") or "")
        for r in translation_records
        if r.get("verse_key")
    }

    if len(chapters_raw) != EXPECTED_CHAPTERS:
        raise QuranFoundationError(f"Expected 114 chapters, received {len(chapters_raw)}.")
    if len(verses_raw) != EXPECTED_VERSES:
        raise QuranFoundationError(f"Expected 6236 verses, received {len(verses_raw)}.")
    if len(words_raw) != EXPECTED_WORDS or len(mushaf_words) < EXPECTED_WORDS:
        raise QuranFoundationError("Uthmani word data is incomplete.")
    if len(translations_by_key) != EXPECTED_VERSES:
        raise QuranFoundationError("Saheeh International translation snapshot is incomplete.")

    page_for_verse: dict[int, int] = {}
    for row in mushaf_records:
        if row.get("record_type") != "mushaf_page":
            continue
        first_id = int(row.get("first_verse_id", 0))
        last_id = int(row.get("last_verse_id", 0))
        page_number = int(row.get("page_number", 0))
        if first_id and last_id and page_number:
            for verse_id in range(first_id, last_id + 1):
                page_for_verse[verse_id] = page_number

    words_by_verse: dict[int, list[dict]] = {}
    for word in words_raw:
        word_id = int(word["id"])
        word_text = mushaf_words.get(word_id)
        if not word_text:
            raise QuranFoundationError(f"Missing Uthmani Hafs word text for id {word_id}.")
        verse_id = int(word["verse_id"])
        words_by_verse.setdefault(verse_id, []).append(
            {"position": int(word.get("position", 0)), "text": word_text}
        )
    for items in words_by_verse.values():
        items.sort(key=lambda item: item["position"])

    verses = []
    for row in verses_raw:
        verse_key = str(row["verse_key"])
        translation_text = translations_by_key.get(verse_key)
        if not translation_text:
            raise QuranFoundationError(f"Missing Saheeh International translation for {verse_key}.")
        verse_id = int(row["id"])
        chapter_id = int(row["chapter_id"])
        verses.append({
            "key": verse_key,
            "chapter": chapter_id,
            "number": int(row["verse_number"]),
            "text": str(row["text_uthmani"]),
            "words": words_by_verse.get(verse_id, []),
            "translation": translation_text,
            "juz": int(row.get("juz_number") or 0),
            "page": page_for_verse.get(verse_id, 0),
        })

    verses_by_chapter: dict[int, list[dict]] = {}
    for verse in verses:
        verses_by_chapter.setdefault(verse["chapter"], []).append(verse)

    chapters = []
    for row in chapters_raw:
        chapter_id = int(row.get("chapter_number", row["id"]))
        chapter_verses = verses_by_chapter.get(chapter_id, [])
        pages = [v["page"] for v in chapter_verses if v["page"]]
        chapters.append({
            "id": chapter_id,
            "name_arabic": str(row.get("name_arabic") or ""),
            "name_simple": str(row.get("name_simple") or ""),
            "translated_name": str(row.get("translated_name") or ""),
            "revelation_place": str(row.get("revelation_place") or "unknown"),
            "revelation_order": int(row.get("revelation_order") or 0),
            "verses_count": int(row.get("verses_count") or len(chapter_verses)),
            "bismillah_pre": bool(row.get("bismillah_pre", chapter_id not in {1, 9})),
            "pages": [min(pages), max(pages)] if pages else [],
        })

    topics = [
        {
            "id": item["id"],
            "name": item["name"],
            "description": item["description"],
            "verse_keys": item["keys"],
            "complete": False,
            "note": TOPIC_NOTE,
        }
        for item in TOPICS
    ]
    now = datetime.now(timezone.utc).isoformat()
    bundle = {
        "schema_version": 1,
        "generated_at": now,
        "source": {
            "quran": "Quran Foundation Content Sync — quran_core:1 and mushafs:4",
            "translation": "Saheeh International",
            "attribution": "Quran data provided by Quran Foundation.",
        },
        "translation": {
            "resource_id": int(translation_info["id"]),
            "name": str(translation_info.get("name") or "Saheeh International"),
            "author_name": str(translation_info.get("author_name") or "Saheeh International"),
        },
        "sync": {
            "resources_filter": resources_filter,
            "next_sync_token": sync_token,
            "last_sync_at": now,
        },
        "chapters": chapters,
        "verses": verses,
        "topics": topics,
        "reciters": [],
        "audio": [],
    }
    _validate_bundle(bundle)
    return bundle


def _validate_bundle(bundle: dict) -> None:
    chapters = bundle["chapters"]
    verses = bundle["verses"]
    if len(chapters) != EXPECTED_CHAPTERS or [c["id"] for c in chapters] != list(range(1, 115)):
        raise QuranFoundationError("Offline copy failed the 114-chapter sequence check.")
    if len(verses) != EXPECTED_VERSES or len({v["key"] for v in verses}) != EXPECTED_VERSES:
        raise QuranFoundationError("Offline copy failed the 6236-verse integrity check.")
    if sum(len(v["words"]) for v in verses) != EXPECTED_WORDS:
        raise QuranFoundationError("Offline copy failed the 83,665-word integrity check.")
    if any(not v["text"] or not v["translation"] or not v["words"] for v in verses):
        raise QuranFoundationError("Offline copy contains an incomplete verse record.")


_CACHE_LOCK = threading.RLock()
_CACHE_BUNDLE: dict | None = None
_CACHE_LAST_SYNC: datetime | None = None


def get_offline_quran_bundle(known_version: str | None = None) -> dict:
    """Return a current local-use bundle; sync from QF at most once per six days per worker."""
    global _CACHE_BUNDLE, _CACHE_LAST_SYNC
    client_id = os.environ.get("QF_CLIENT_ID", "").strip()
    client_secret = os.environ.get("QF_CLIENT_SECRET", "").strip()
    environment = os.environ.get("QF_ENV", "production").strip().lower()
    if not client_id or not client_secret:
        raise QuranFoundationError("QF Content Sync credentials are not configured on the backend.")

    with _CACHE_LOCK:
        now = datetime.now(timezone.utc)
        needs_sync = (
            _CACHE_BUNDLE is None
            or _CACHE_LAST_SYNC is None
            or now - _CACHE_LAST_SYNC >= SYNC_INTERVAL
        )
        if needs_sync:
            client = QuranFoundationClient(client_id, client_secret, environment)
            try:
                translation_info = _find_saheeh_translation(client)
                translation_id = int(translation_info["id"])
                resources_filter = f"quran_core:1;mushafs:{MUSHAF_ID};translations:{translation_id}"

                if _CACHE_BUNDLE is None or _CACHE_BUNDLE["sync"]["resources_filter"] != resources_filter:
                    mutations, token = _sync_pages(client, resources_filter, None)
                    required = {
                        "quran_core:1",
                        f"mushafs:{MUSHAF_ID}",
                        f"translations:{translation_id}",
                    }
                    snapshots = {}
                    for mutation in mutations:
                        if mutation.get("type") not in {"RESOURCE_CREATE", "RESOURCE_INVALIDATE"}:
                            continue
                        group = mutation.get("resource_group")
                        resource_id = mutation.get("resource_id")
                        snapshot_url = mutation.get("snapshot_url")
                        if snapshot_url and group and resource_id is not None:
                            snapshots[f"{group}:{resource_id}"] = client.get(snapshot_url)
                    if required - set(snapshots):
                        raise QuranFoundationError("Content Sync bootstrap did not return all required public resources.")
                else:
                    mutations, token = _sync_pages(
                        client, resources_filter, _CACHE_BUNDLE["sync"]["next_sync_token"]
                    )
                    if mutations:
                        snapshots = _fetch_all_snapshots(client, translation_id)
                    else:
                        _CACHE_BUNDLE["sync"]["next_sync_token"] = token
                        _CACHE_BUNDLE["sync"]["last_sync_at"] = now.isoformat()
                        _CACHE_LAST_SYNC = now
                        snapshots = None

                if snapshots is not None:
                    _CACHE_BUNDLE = _build_bundle(
                        snapshots["quran_core:1"],
                        snapshots[f"mushafs:{MUSHAF_ID}"],
                        snapshots[f"translations:{translation_id}"],
                        translation_info,
                        resources_filter,
                        token,
                    )
                _CACHE_LAST_SYNC = now
            finally:
                client.close()

        if _CACHE_BUNDLE is None:
            raise QuranFoundationError("No verified offline Quran copy is available.")
        if known_version and known_version == _CACHE_BUNDLE["generated_at"]:
            return {
                "status": "unchanged",
                "generated_at": _CACHE_BUNDLE["generated_at"],
                "last_sync_at": _CACHE_BUNDLE["sync"]["last_sync_at"],
                "next_sync_token": _CACHE_BUNDLE["sync"]["next_sync_token"],
                "resources_filter": _CACHE_BUNDLE["sync"]["resources_filter"],
            }
        return {"status": "updated", "bundle": copy.deepcopy(_CACHE_BUNDLE)}


def _fetch_all_snapshots(client: QuranFoundationClient, translation_id: int) -> dict[str, dict]:
    return {
        "quran_core:1": client.get("/api/v4/resources/snapshots/quran_core/1"),
        f"mushafs:{MUSHAF_ID}": client.get(f"/api/v4/resources/snapshots/mushafs/{MUSHAF_ID}"),
        f"translations:{translation_id}": client.get(
            f"/api/v4/resources/snapshots/translations/{translation_id}"
        ),
    }
