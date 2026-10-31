#!/usr/bin/env python3
"""Build the app's offline Quran bundle using Quran Foundation Content Sync only.

Required environment:
  QF_CLIENT_ID
  QF_CLIENT_SECRET
Optional:
  QF_ENV=production|prelive
  OFFLINE_CONTENT_OUTPUT=frontend/public/offline/quran-content.json

The client secret is used only by this build-time script. It is never written to
the generated bundle and must never be included in the Android application.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx

EXPECTED_CHAPTERS = 114
EXPECTED_VERSES = 6236
EXPECTED_WORDS = 83665
MUSHAF_ID = 4  # Uthmani Hafs; provides word-level Uthmani text.
TRANSLATION_MATCH = "saheeh international"


def normalize_label(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


class QuranFoundationClient:
    def __init__(self, client_id: str, client_secret: str, environment: str):
        if environment not in {"production", "prelive"}:
            raise ValueError("QF_ENV must be production or prelive")
        self.client_id = client_id
        self.environment = environment
        if environment == "prelive":
            self.auth_url = "https://prelive-oauth2.quran.foundation/oauth2/token"
            self.content_root = "https://apis-prelive.quran.foundation/content"
        else:
            self.auth_url = "https://oauth2.quran.foundation/oauth2/token"
            self.content_root = "https://apis.quran.foundation/content"
        self.api_base = self.content_root + "/api/v4"
        self.http = httpx.Client(timeout=90, follow_redirects=True)
        token_response = self.http.post(
            self.auth_url,
            auth=(client_id, client_secret),
            data={"grant_type": "client_credentials", "scope": "content"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        token_response.raise_for_status()
        self.token = token_response.json()["access_token"]
        self.headers = {"x-auth-token": self.token, "x-client-id": self.client_id}

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
            raise RuntimeError(payload.get("message", "Quran Foundation request failed"))
        return payload

    def close(self) -> None:
        self.http.close()


def find_saheeh_translation(client: QuranFoundationClient) -> dict:
    payload = client.get("resources/translations", {"language": "en"})
    translations = payload.get("translations", [])
    matches = []
    for item in translations:
        label = " ".join(
            str(item.get(k) or "")
            for k in ("name", "author_name", "slug", "translated_name")
        )
        if TRANSLATION_MATCH in normalize_label(label):
            matches.append(item)
    if len(matches) != 1:
        names = [x.get("name", "") for x in matches]
        raise RuntimeError(
            "Could not identify exactly one public Saheeh International translation "
            f"resource through the Content API catalog (matches={names})."
        )
    return matches[0]


def bootstrap_snapshots(
    client: QuranFoundationClient, resources_filter: str
) -> tuple[dict[str, dict], str]:
    url = client.api_base + "/resources/sync"
    params: dict | None = {
        "bootstrap": "true",
        "resources": resources_filter,
        "per_page": 100,
    }
    snapshots: dict[str, dict] = {}
    final_token = ""

    while True:
        page = client.get(url, params=params)
        params = None
        sync = page.get("sync", page)
        for mutation in sync.get("mutations", []):
            if mutation.get("type") not in {"RESOURCE_CREATE", "RESOURCE_INVALIDATE"}:
                continue
            snapshot_path = mutation.get("snapshot_url")
            group = mutation.get("resource_group")
            resource_id = mutation.get("resource_id")
            if not snapshot_path or not group or resource_id is None:
                continue
            key = f"{group}:{resource_id}"
            if key not in snapshots:
                snapshots[key] = client.get(snapshot_path)

        if not sync.get("has_more", False):
            final_token = sync.get("next_sync_token") or ""
            break
        next_page = sync.get("next_page_url")
        if not next_page:
            raise RuntimeError("Content Sync reports has_more=true without next_page_url")
        url = next_page

    if not final_token:
        raise RuntimeError("Content Sync bootstrap did not return a final sync token")
    return snapshots, final_token


def build_bundle(
    core: dict,
    mushaf: dict,
    translation: dict,
    topics: list[dict],
    translation_info: dict,
    sync_filter: str,
    sync_token: str,
    strict: bool = True,
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

    if strict:
        if len(chapters_raw) != EXPECTED_CHAPTERS:
            raise RuntimeError(f"Expected 114 chapters from quran_core, got {len(chapters_raw)}")
        if len(verses_raw) != EXPECTED_VERSES:
            raise RuntimeError(f"Expected 6236 verses from quran_core, got {len(verses_raw)}")
        if len(words_raw) != EXPECTED_WORDS:
            raise RuntimeError(f"Expected 83665 word rows from quran_core, got {len(words_raw)}")
        if len(mushaf_words) < EXPECTED_WORDS:
            raise RuntimeError(
                f"Uthmani Hafs mushaf snapshot has only {len(mushaf_words)} word texts; "
                f"expected at least {EXPECTED_WORDS}"
            )
        if len(translations_by_key) != EXPECTED_VERSES:
            raise RuntimeError(
                f"Saheeh International snapshot has {len(translations_by_key)} verse rows; "
                f"expected {EXPECTED_VERSES}"
            )

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
        text = mushaf_words.get(word_id)
        if not text:
            raise RuntimeError(f"Missing Uthmani Hafs text for Quran Foundation word id {word_id}")
        verse_id = int(word["verse_id"])
        words_by_verse.setdefault(verse_id, []).append(
            {"position": int(word.get("position", 0)), "text": text}
        )
    for items in words_by_verse.values():
        items.sort(key=lambda x: x["position"])

    verses = []
    for row in verses_raw:
        verse_key = str(row["verse_key"])
        if verse_key not in translations_by_key:
            raise RuntimeError(f"Missing Saheeh International translation for {verse_key}")
        verse_id = int(row["id"])
        chapter_id = int(row["chapter_id"])
        verses.append({
            "key": verse_key,
            "chapter": chapter_id,
            "number": int(row["verse_number"]),
            "text": str(row["text_uthmani"]),
            "words": words_by_verse.get(verse_id, []),
            "translation": translations_by_key[verse_key],
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

    return {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
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
        "sync": {"resources_filter": sync_filter, "next_sync_token": sync_token},
        "chapters": chapters,
        "verses": verses,
        "topics": topics,
        "reciters": [],
        "audio": [],
    }


def validate_bundle(bundle: dict) -> None:
    chapters = bundle["chapters"]
    verses = bundle["verses"]
    if len(chapters) != EXPECTED_CHAPTERS or [c["id"] for c in chapters] != list(range(1, 115)):
        raise RuntimeError("Offline bundle chapter count or ordering validation failed")
    if len(verses) != EXPECTED_VERSES:
        raise RuntimeError("Offline bundle verse count validation failed")
    keys = [v["key"] for v in verses]
    if len(set(keys)) != EXPECTED_VERSES:
        raise RuntimeError("Offline bundle contains duplicate verse keys")
    if any(not v["text"] or not v["translation"] for v in verses):
        raise RuntimeError("Offline bundle contains an empty Quran text or translation")
    if sum(len(v["words"]) for v in verses) != EXPECTED_WORDS:
        raise RuntimeError("Offline bundle word count does not match the canonical 83,665 words")
    if any(not v["words"] for v in verses):
        raise RuntimeError("Offline bundle contains a verse without word-level Uthmani text")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        default=os.environ.get(
            "OFFLINE_CONTENT_OUTPUT", "frontend/public/offline/quran-content.json"
        ),
    )
    args = parser.parse_args()

    client_id = os.environ.get("QF_CLIENT_ID", "").strip()
    client_secret = os.environ.get("QF_CLIENT_SECRET", "").strip()
    environment = os.environ.get("QF_ENV", "production").strip().lower()
    if not client_id or not client_secret:
        raise SystemExit("QF_CLIENT_ID and QF_CLIENT_SECRET are required; no credentials were read from files.")

    client = QuranFoundationClient(client_id, client_secret, environment)
    try:
        translation_info = find_saheeh_translation(client)
        translation_id = int(translation_info["id"])
        resources_filter = f"quran_core:1;mushafs:{MUSHAF_ID};translations:{translation_id}"
        snapshots, sync_token = bootstrap_snapshots(client, resources_filter)
        required = {"quran_core:1", f"mushafs:{MUSHAF_ID}", f"translations:{translation_id}"}
        missing = sorted(required - set(snapshots))
        if missing:
            raise RuntimeError(
                "Content Sync did not return all required public snapshots: " + ", ".join(missing)
            )

        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from lib.topics import TOPICS, TOPIC_NOTE

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
        bundle = build_bundle(
            snapshots["quran_core:1"],
            snapshots[f"mushafs:{MUSHAF_ID}"],
            snapshots[f"translations:{translation_id}"],
            topics,
            translation_info,
            resources_filter,
            sync_token,
        )
        validate_bundle(bundle)

        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(bundle, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        print(
            f"Offline bundle created: {output} "
            f"({len(bundle['chapters'])} chapters, {len(bundle['verses'])} verses, "
            f"{sum(len(v['words']) for v in bundle['verses'])} words)"
        )
        print("No OAuth credentials or access tokens were written to the bundle.")
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
