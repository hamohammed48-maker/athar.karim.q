from typing import List
from pydantic import BaseModel


class Chapter(BaseModel):
    id: int
    name_arabic: str
    name_simple: str
    translated_name: str
    revelation_place: str
    revelation_order: int
    verses_count: int
    bismillah_pre: bool
    pages: List[int]


class Word(BaseModel):
    position: int
    text: str


class Verse(BaseModel):
    key: str
    chapter: int
    number: int
    text: str
    words: List[Word]
    translation: str
    juz: int
    page: int


class ChapterDetail(BaseModel):
    chapter: Chapter
    verses: List[Verse]


class SearchResponse(BaseModel):
    query: str
    total: int
    results: List[Verse]
    indexed_chapters: int


class Topic(BaseModel):
    id: str
    name: str
    description: str
    verse_keys: List[str]
    complete: bool
    note: str


class TopicDetail(Topic):
    verses: List[Verse]


class Reciter(BaseModel):
    id: int
    name: str
    name_en: str
    style: str


class VerseTiming(BaseModel):
    verse_key: str
    start_ms: int
    end_ms: int
    segments: List[List[int]]  # [word_position, start_ms, end_ms]


class ChapterAudio(BaseModel):
    reciter_id: int
    chapter: int
    audio_url: str
    duration_ms: int
    has_word_timing: bool
    timings: List[VerseTiming]


class IntegrityReport(BaseModel):
    ok: bool
    chapters_count: int
    expected_chapters: int
    cached_chapters: int
    verses_count: int
    expected_verses: int
    issues: List[str]
    source: str
