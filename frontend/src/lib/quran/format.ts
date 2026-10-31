const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export const toArabicDigits = (n: number | string) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

export const parseKey = (key: string) => {
  const [c, v] = key.split(":").map(Number);
  return { chapter: c, verse: v };
};

export const compareKeys = (a: string, b: string) => {
  const x = parseKey(a);
  const y = parseKey(b);
  return x.chapter - y.chapter || x.verse - y.verse;
};

export const formatTime = (ms: number) => {
  if (!Number.isFinite(ms) || ms < 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const verseMarker = (n: number) => `\uFD3F${toArabicDigits(n)}\uFD3E`;

export const revelationLabel = (p: string) => p === "makkah" ? "مكية" : p === "madinah" ? "مدنية" : "غير محدد";

/** Light Arabic normalisation for client-side filtering of surah names (display text untouched). */
export const normalizeArabic = (s: string) =>
  s
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .toLowerCase();

export const formatBytes = (b: number) => {
  if (!Number.isFinite(b) || b <= 0) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} ك.ب`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} م.ب`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} ج.ب`;
};

export const formatDate = (ts: number) =>
  new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ts));
