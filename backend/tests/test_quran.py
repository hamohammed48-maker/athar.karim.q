"""Data-integrity and API tests for Athar Kareem (hit the live backend)."""
import re


def test_chapters_count_and_order(client):
    r = client.get("/quran/chapters")
    assert r.status_code == 200
    ch = r.json()
    assert len(ch) == 114
    assert [c["id"] for c in ch] == list(range(1, 115))
    assert sum(c["verses_count"] for c in ch) == 6236


def test_integrity_report(client):
    r = client.get("/quran/integrity")
    assert r.status_code == 200
    d = r.json()
    assert d["chapters_count"] == 114
    if d["cached_chapters"] == 114:
        assert d["ok"], d["issues"]
        assert d["verses_count"] == 6236


def test_chapter_verses_are_ordered_and_keyed(client):
    d = client.get("/quran/chapters/94").json()
    nums = [v["number"] for v in d["verses"]]
    assert nums == list(range(1, 9))
    for v in d["verses"]:
        assert v["key"] == f"94:{v['number']}"
        assert v["text"].strip() and v["words"]
    from lib.arabic import normalize
    assert normalize(d["verses"][4]["text"]) == "فان مع العسر يسرا"
    assert len(d["verses"][4]["words"]) == 4


def test_verses_by_keys_preserves_order(client):
    keys = ["94:6", "2:153", "94:5"]
    d = client.get("/quran/verses", params={"keys": ",".join(keys)}).json()
    assert [v["key"] for v in d] == keys


def test_invalid_references(client):
    assert client.get("/quran/chapters/0").status_code == 404
    assert client.get("/quran/chapters/115").status_code == 404
    assert client.get("/quran/verses", params={"keys": "abc"}).status_code == 400
    assert client.get("/quran/verses", params={"keys": "1:8"}).status_code == 404


def test_search_ignores_diacritics(client):
    # Search covers chapters already requested by this backend process; the APK searches its own local DB.
    assert client.get("/quran/chapters/2").status_code == 200
    d = client.get("/quran/search", params={"q": "الصابرين"}).json()
    assert d["total"] > 0
    assert "2:153" in [v["key"] for v in d["results"]]
    assert client.get("/quran/search", params={"q": "؟"}).status_code in (400, 422)


def test_random_verse_is_real_and_respects_exclude(client):
    v = client.get("/quran/random").json()
    assert re.match(r"^\d+:\d+$", v["key"]) and v["text"]
    again = client.get("/quran/random", params={"exclude": v["key"]}).json()
    assert again["key"] != v["key"]


def test_topics_resolve_to_real_verses(client):
    topics = client.get("/quran/topics").json()
    assert len(topics) >= 10
    for t in topics:
        assert t["complete"] is False
        d = client.get(f"/quran/topics/{t['id']}").json()
        assert [v["key"] for v in d["verses"]] == t["verse_keys"]


def test_reciter_audio_and_word_timing(client):
    rec = client.get("/quran/reciters").json()
    assert any(r["id"] == 7 for r in rec)
    a = client.get("/quran/audio/7/94").json()
    assert a["audio_url"].startswith("https://download.quranicaudio.com/")
    assert len(a["timings"]) == 8 and a["has_word_timing"]
    for t in a["timings"]:
        assert t["end_ms"] > t["start_ms"]
        assert all(len(s) == 3 for s in t["segments"])
    assert client.get("/quran/audio/99999/1").status_code == 404
