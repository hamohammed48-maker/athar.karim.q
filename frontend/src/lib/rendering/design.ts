// Versioned, reusable design settings — independent of verses and reciter.
export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type Resolution = "720p" | "1080p";
export type BgKind = "builtin" | "color" | "image" | "video";

export interface BackgroundSettings {
  kind: BgKind;
  builtinId: string;
  color: string;
  mediaId: string | null;
  mediaName: string | null;
  fit: "cover" | "contain";
  scale: number; // 1..2
  offsetX: number; // -50..50 (%)
  offsetY: number;
  overlayColor: string;
  overlayOpacity: number; // 0..0.85
  motion: "none" | "zoom";
}

export interface DesignSettings {
  version: 1;
  aspect: AspectRatio;
  background: BackgroundSettings;
  text: {
    fontFamily: string;
    fontSize: number; // px at 1080 reference
    color: string;
    align: "right" | "center" | "left";
    position: "top" | "center" | "bottom";
    offsetY: number; // -20..20 (% of height)
    lineHeight: number; // 1.4..2.6
    maxWidth: number; // 50..95 (% of width)
    showVerseNumber: boolean;
    showReference: boolean;
    referenceColor: string;
  };
  shadow: { enabled: boolean; color: string; opacity: number; blur: number; offsetX: number; offsetY: number };
  tracking: { enabled: boolean; color: string; style: "color" | "background" | "underline"; dimOthers: boolean };
  translation: { enabled: boolean; color: string; fontSize: number; opacity: number };
  watermark: { enabled: boolean; position: "top-right" | "top-left" | "bottom-right" | "bottom-left"; size: number; opacity: number };
  visualizer: { enabled: boolean; style: "bars" | "wave"; position: "top" | "bottom"; size: number; color: string };
  decoration: { style: "none" | "frame" | "lines"; color: string };
  export: { resolution: Resolution; fps: 30 };
}

export const ASPECTS: { id: AspectRatio; label: string; w: number; h: number }[] = [
  { id: "9:16", label: "عمودي 9:16", w: 9, h: 16 },
  { id: "16:9", label: "أفقي 16:9", w: 16, h: 9 },
  { id: "1:1", label: "مربع 1:1", w: 1, h: 1 },
  { id: "4:5", label: "منشور 4:5", w: 4, h: 5 },
];

export const RESOLUTIONS: { id: Resolution; label: string; short: number; bitrate: number }[] = [
  { id: "720p", label: "720p", short: 720, bitrate: 5_000_000 },
  { id: "1080p", label: "1080p", short: 1080, bitrate: 8_000_000 },
];

export function dimensions(aspect: AspectRatio, shortSide: number) {
  const a = ASPECTS.find((x) => x.id === aspect) ?? ASPECTS[0];
  const ratio = a.w / a.h;
  const w = ratio < 1 ? shortSide : Math.round(shortSide * ratio);
  const h = ratio < 1 ? Math.round(shortSide / ratio) : shortSide;
  return { w: w - (w % 2), h: h - (h % 2) };
}

export const QURAN_FONTS = [
  { id: "Amiri Quran", label: "أميري قرآن" },
  { id: "Scheherazade New", label: "شهرزاد" },
  { id: "Amiri", label: "أميري" },
  { id: "Noto Naskh Arabic", label: "نوتو نسخ" },
];

export const BUILTIN_BACKGROUNDS = [
  { id: "night-mosque", label: "ليل ومسجد" },
  { id: "mosque-sunset", label: "مسجد عند الغروب" },
  { id: "mountains", label: "جبال" },
  { id: "forest", label: "غابة" },
  { id: "desert", label: "صحراء ونجوم" },
  { id: "sea", label: "بحر" },
];
export const bgUrl = (id: string, thumb = false) => `/backgrounds/${thumb ? "thumb-" : ""}${id}.jpg`;

export const TEXT_SWATCHES = ["#F8FAFC", "#E7B85C", "#FDE68A", "#B8C5D1", "#93C5FD", "#A7F3D0", "#FCA5A5", "#071827"];
export const SOLID_BACKGROUNDS = ["#071827", "#0B2233", "#102C3F", "#1E293B", "#2B1E12", "#0F2A1F"];

const BASE: DesignSettings = {
  version: 1,
  aspect: "9:16",
  background: {
    kind: "builtin", builtinId: "night-mosque", color: "#071827", mediaId: null, mediaName: null,
    fit: "cover", scale: 1, offsetX: 0, offsetY: 0, overlayColor: "#071827", overlayOpacity: 0.45, motion: "none",
  },
  text: {
    fontFamily: "Amiri Quran", fontSize: 88, color: "#F8FAFC", align: "center", position: "center", offsetY: 0,
    lineHeight: 2, maxWidth: 84, showVerseNumber: true, showReference: true, referenceColor: "#E7B85C",
  },
  shadow: { enabled: true, color: "#000000", opacity: 0.6, blur: 14, offsetX: 0, offsetY: 3 },
  tracking: { enabled: true, color: "#E7B85C", style: "color", dimOthers: false },
  translation: { enabled: true, color: "#B8C5D1", fontSize: 34, opacity: 0.95 },
  watermark: { enabled: true, position: "bottom-left", size: 34, opacity: 0.8 },
  visualizer: { enabled: false, style: "bars", position: "bottom", size: 70, color: "#E7B85C" },
  decoration: { style: "frame", color: "#E7B85C" },
  export: { resolution: "1080p", fps: 30 },
};

export interface BuiltinTemplate { id: string; name: string; description: string; design: DesignSettings }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "classic",
    name: "النموذج الكلاسيكي",
    description: "خلفية كحلية ليلية، زخارف ذهبية، خط قرآني أنيق",
    design: clone(BASE),
  },
  {
    id: "modern",
    name: "النموذج الحديث",
    description: "تخطيط معاصر نظيف وتسلسل بصري قوي",
    design: {
      ...clone(BASE),
      background: { ...BASE.background, kind: "color", color: "#0B2233", overlayOpacity: 0 },
      text: { ...BASE.text, fontFamily: "Scheherazade New", fontSize: 92, lineHeight: 1.9, maxWidth: 80, referenceColor: "#B8C5D1" },
      shadow: { ...BASE.shadow, enabled: false },
      tracking: { enabled: true, color: "#2563EB", style: "background", dimOthers: false },
      translation: { ...BASE.translation, color: "#F8FAFC", opacity: 0.75 },
      visualizer: { enabled: true, style: "bars", position: "bottom", size: 60, color: "#2563EB" },
      decoration: { style: "lines", color: "#2563EB" },
    },
  },
  {
    id: "nature",
    name: "النموذج الطبيعي",
    description: "مناظر طبيعية هادئة مع حركة خفيفة",
    design: {
      ...clone(BASE),
      background: { ...BASE.background, builtinId: "mountains", overlayColor: "#000000", overlayOpacity: 0.35, motion: "zoom" },
      text: { ...BASE.text, fontFamily: "Amiri", fontSize: 84, color: "#FFFFFF", referenceColor: "#FDE68A" },
      shadow: { enabled: true, color: "#000000", opacity: 0.8, blur: 18, offsetX: 0, offsetY: 4 },
      tracking: { enabled: true, color: "#FDE68A", style: "underline", dimOthers: true },
      translation: { ...BASE.translation, color: "#F8FAFC" },
      decoration: { style: "none", color: "#E7B85C" },
    },
  },
];

export const defaultDesign = (): DesignSettings => clone(BASE);

/** Applies a template's look while keeping the user's frame/export choices. */
export const applyBuiltin = (current: DesignSettings, t: BuiltinTemplate): DesignSettings => ({
  ...clone(t.design),
  aspect: current.aspect,
  export: current.export,
  watermark: { ...t.design.watermark, enabled: current.watermark.enabled },
});

// ---- validation of untrusted (imported) data: whitelist + clamp, never eval ----
const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const col = (v: unknown, d: string) => (isHex(v) ? v : d);
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});

export function sanitizeDesign(input: unknown): DesignSettings {
  const d = defaultDesign();
  const i = obj(input);
  const b = obj(i.background), t = obj(i.text), s = obj(i.shadow), tr = obj(i.tracking), tl = obj(i.translation);
  const w = obj(i.watermark), vz = obj(i.visualizer), dc = obj(i.decoration), ex = obj(i.export);
  return {
    version: 1,
    aspect: oneOf(i.aspect, ["9:16", "16:9", "1:1", "4:5"] as const, d.aspect),
    background: {
      kind: oneOf(b.kind, ["builtin", "color", "image", "video"] as const, d.background.kind),
      builtinId: BUILTIN_BACKGROUNDS.some((x) => x.id === b.builtinId) ? (b.builtinId as string) : d.background.builtinId,
      color: col(b.color, d.background.color),
      mediaId: typeof b.mediaId === "string" && /^[\w-]{1,64}$/.test(b.mediaId) ? b.mediaId : null,
      mediaName: typeof b.mediaName === "string" ? b.mediaName.slice(0, 120) : null,
      fit: oneOf(b.fit, ["cover", "contain"] as const, "cover"),
      scale: num(b.scale, 1, 2, 1),
      offsetX: num(b.offsetX, -50, 50, 0),
      offsetY: num(b.offsetY, -50, 50, 0),
      overlayColor: col(b.overlayColor, d.background.overlayColor),
      overlayOpacity: num(b.overlayOpacity, 0, 0.85, d.background.overlayOpacity),
      motion: oneOf(b.motion, ["none", "zoom"] as const, "none"),
    },
    text: {
      fontFamily: QURAN_FONTS.some((f) => f.id === t.fontFamily) ? (t.fontFamily as string) : d.text.fontFamily,
      fontSize: num(t.fontSize, 28, 120, d.text.fontSize),
      color: col(t.color, d.text.color),
      align: oneOf(t.align, ["right", "center", "left"] as const, "center"),
      position: oneOf(t.position, ["top", "center", "bottom"] as const, "center"),
      offsetY: num(t.offsetY, -20, 20, 0),
      lineHeight: num(t.lineHeight, 1.4, 2.6, d.text.lineHeight),
      maxWidth: num(t.maxWidth, 50, 95, d.text.maxWidth),
      showVerseNumber: bool(t.showVerseNumber, true),
      showReference: bool(t.showReference, true),
      referenceColor: col(t.referenceColor, d.text.referenceColor),
    },
    shadow: {
      enabled: bool(s.enabled, d.shadow.enabled), color: col(s.color, d.shadow.color), opacity: num(s.opacity, 0, 1, d.shadow.opacity),
      blur: num(s.blur, 0, 40, d.shadow.blur), offsetX: num(s.offsetX, -20, 20, 0), offsetY: num(s.offsetY, -20, 20, d.shadow.offsetY),
    },
    tracking: {
      enabled: bool(tr.enabled, true), color: col(tr.color, d.tracking.color),
      style: oneOf(tr.style, ["color", "background", "underline"] as const, "color"), dimOthers: bool(tr.dimOthers, false),
    },
    translation: {
      enabled: bool(tl.enabled, true), color: col(tl.color, d.translation.color),
      fontSize: num(tl.fontSize, 16, 60, d.translation.fontSize), opacity: num(tl.opacity, 0.3, 1, d.translation.opacity),
    },
    watermark: {
      enabled: bool(w.enabled, true),
      position: oneOf(w.position, ["top-right", "top-left", "bottom-right", "bottom-left"] as const, "bottom-left"),
      size: num(w.size, 18, 80, d.watermark.size), opacity: num(w.opacity, 0.2, 1, d.watermark.opacity),
    },
    visualizer: {
      enabled: bool(vz.enabled, false), style: oneOf(vz.style, ["bars", "wave"] as const, "bars"),
      position: oneOf(vz.position, ["top", "bottom"] as const, "bottom"), size: num(vz.size, 30, 160, 70), color: col(vz.color, d.visualizer.color),
    },
    decoration: { style: oneOf(dc.style, ["none", "frame", "lines"] as const, "frame"), color: col(dc.color, d.decoration.color) },
    export: { resolution: oneOf(ex.resolution, ["720p", "1080p"] as const, "1080p"), fps: 30 },
  };
}
