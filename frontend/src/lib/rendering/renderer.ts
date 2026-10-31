import type { DesignSettings } from "@/lib/rendering/design";
import { toArabicDigits, verseMarker } from "@/lib/quran/format";
import type { Verse } from "@/types/quran";

/** Everything that changes per frame. Same input → same pixels, for preview and export alike. */
export interface FrameInput {
  verse: Verse | null;
  surahName: string;
  activeWord: number | null; // word position from real timing data
  timeSec: number; // for subtle motion
  levels: Uint8Array | null; // real analyser data (null when silent)
}

export interface FrameAssets {
  bg: CanvasImageSource | null;
  bgWidth: number;
  bgHeight: number;
  logo: HTMLImageElement | null;
}

const UI_FONT = "'IBM Plex Sans Arabic', sans-serif";

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawBackground(ctx: CanvasRenderingContext2D, W: number, H: number, d: DesignSettings, a: FrameAssets, t: number) {
  const b = d.background;
  ctx.fillStyle = b.color;
  ctx.fillRect(0, 0, W, H);
  if (b.kind !== "color" && a.bg && a.bgWidth > 0 && a.bgHeight > 0) {
    const base = b.fit === "cover" ? Math.max(W / a.bgWidth, H / a.bgHeight) : Math.min(W / a.bgWidth, H / a.bgHeight);
    const motion = b.motion === "zoom" ? 1 + 0.06 * (0.5 - 0.5 * Math.cos((t / 24) * Math.PI * 2)) : 1;
    const s = base * b.scale * motion;
    const dw = a.bgWidth * s;
    const dh = a.bgHeight * s;
    const x = (W - dw) / 2 + (b.offsetX / 100) * W;
    const y = (H - dh) / 2 + (b.offsetY / 100) * H;
    ctx.drawImage(a.bg, x, y, dw, dh);
  }
  if (b.overlayOpacity > 0) {
    ctx.fillStyle = hexA(b.overlayColor, b.overlayOpacity);
    ctx.fillRect(0, 0, W, H);
  }
}

function drawFrameDecoration(ctx: CanvasRenderingContext2D, W: number, H: number, d: DesignSettings, u: number) {
  if (d.decoration.style !== "frame") return;
  const m = 36 * u;
  ctx.save();
  ctx.strokeStyle = hexA(d.decoration.color, 0.75);
  ctx.lineWidth = Math.max(1, 2 * u);
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  ctx.strokeStyle = hexA(d.decoration.color, 0.35);
  ctx.strokeRect(m + 10 * u, m + 10 * u, W - 2 * m - 20 * u, H - 2 * m - 20 * u);
  ctx.fillStyle = d.decoration.color;
  const r = 9 * u;
  for (const [cx, cy] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

interface Token { text: string; pos: number | null; w: number }
interface Line { tokens: Token[]; width: number }

function wrap(ctx: CanvasRenderingContext2D, tokens: Token[], maxW: number, space: number): Line[] {
  const lines: Line[] = [];
  let cur: Token[] = [];
  let width = 0;
  for (const tk of tokens) {
    const add = cur.length ? space + tk.w : tk.w;
    if (cur.length && width + add > maxW) {
      lines.push({ tokens: cur, width });
      cur = [tk];
      width = tk.w;
    } else {
      cur.push(tk);
      width += add;
    }
  }
  if (cur.length) lines.push({ tokens: cur, width });
  return lines;
}

function wrapLatin(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxW) {
      out.push(line);
      line = word;
    } else line = test;
  }
  if (line) out.push(line);
  return out;
}

export function renderFrame(ctx: CanvasRenderingContext2D, W: number, H: number, d: DesignSettings, f: FrameInput, a: FrameAssets) {
  const u = Math.min(W, H) / 1080;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  drawBackground(ctx, W, H, d, a, f.timeSec);
  drawFrameDecoration(ctx, W, H, d, u);

  const safeTop = H * 0.08;
  const safeBottom = H * 0.92;
  const maxW = (W * d.text.maxWidth) / 100;

  if (f.verse) {
    const words: Token[] = f.verse.words.map((w) => ({ text: w.text, pos: w.position, w: 0 }));
    if (d.text.showVerseNumber) words.push({ text: verseMarker(f.verse.number), pos: null, w: 0 });

    // Auto-fit: shrink the font (never distort glyphs) until the block fits in the frame.
    let size = d.text.fontSize * u;
    let lines: Line[] = [];
    let trLines: string[] = [];
    let blockH = 0;
    const trSize = d.translation.fontSize * u;
    const refSize = 26 * u;
    for (let k = 0; k < 14; k++) {
      ctx.font = `${size}px "${d.text.fontFamily}", "Amiri Quran", serif`;
      ctx.direction = "rtl";
      const space = ctx.measureText(" ").width * 1.15;
      for (const t of words) t.w = ctx.measureText(t.text).width;
      lines = wrap(ctx, words, maxW, space);
      const textH = lines.length * size * d.text.lineHeight;
      let extra = 0;
      if (d.text.showReference) extra += refSize * 2.2;
      if (d.translation.enabled && f.verse.translation) {
        ctx.font = `${trSize * (size / (d.text.fontSize * u))}px ${UI_FONT}`;
        ctx.direction = "ltr";
        trLines = wrapLatin(ctx, f.verse.translation, maxW);
        extra += trLines.length * trSize * 1.5 + trSize;
      } else trLines = [];
      blockH = textH + extra;
      if (blockH <= (safeBottom - safeTop) * 0.92) break;
      size *= 0.9;
    }
    const scaleTr = size / (d.text.fontSize * u);
    const lineH = size * d.text.lineHeight;

    let y0 =
      d.text.position === "top" ? H * 0.14 : d.text.position === "bottom" ? H * 0.86 - blockH : (H - blockH) / 2;
    y0 += (d.text.offsetY / 100) * H;
    y0 = Math.max(safeTop, Math.min(safeBottom - blockH, y0));

    ctx.font = `${size}px "${d.text.fontFamily}", "Amiri Quran", serif`;
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const space = ctx.measureText(" ").width * 1.15;
    const tracking = d.tracking.enabled && f.activeWord !== null;

    lines.forEach((line, li) => {
      const cy = y0 + li * lineH + lineH / 2;
      const left = (W - maxW) / 2;
      let x =
        d.text.align === "right" ? left + maxW : d.text.align === "left" ? left + line.width : W / 2 + line.width / 2;
      for (const tk of line.tokens) {
        const isActive = tracking && tk.pos === f.activeWord;
        const isMarker = tk.pos === null;
        if (isActive && d.tracking.style === "background") {
          ctx.save();
          ctx.fillStyle = hexA(d.tracking.color, 0.85);
          const pad = size * 0.12;
          const h = size * 1.25;
          ctx.beginPath();
          ctx.roundRect(x - tk.w - pad, cy - h / 2, tk.w + pad * 2, h, size * 0.2);
          ctx.fill();
          ctx.restore();
        }
        ctx.save();
        if (d.shadow.enabled && !(isActive && d.tracking.style === "background")) {
          ctx.shadowColor = hexA(d.shadow.color, d.shadow.opacity);
          ctx.shadowBlur = d.shadow.blur * u;
          ctx.shadowOffsetX = d.shadow.offsetX * u;
          ctx.shadowOffsetY = d.shadow.offsetY * u;
        }
        ctx.globalAlpha = tracking && d.tracking.dimOthers && !isActive && !isMarker ? 0.55 : 1;
        ctx.fillStyle = isMarker
          ? d.text.referenceColor
          : isActive && d.tracking.style === "color"
            ? d.tracking.color
            : d.text.color;
        ctx.fillText(tk.text, x, cy);
        ctx.restore();
        if (isActive && d.tracking.style === "underline") {
          ctx.fillStyle = d.tracking.color;
          ctx.fillRect(x - tk.w, cy + size * 0.62, tk.w, Math.max(2, size * 0.06));
        }
        x -= tk.w + space;
      }
    });

    let y = y0 + lines.length * lineH;
    if (d.decoration.style === "lines") {
      ctx.fillStyle = hexA(d.decoration.color, 0.9);
      ctx.fillRect(W / 2 - 60 * u, y0 - 18 * u, 120 * u, Math.max(2, 3 * u));
    }
    if (d.text.showReference) {
      ctx.font = `500 ${refSize}px ${UI_FONT}`;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.fillStyle = d.text.referenceColor;
      ctx.fillText(`سورة ${f.surahName} · الآية ${toArabicDigits(f.verse.number)}`, W / 2, y + refSize * 1.1);
      y += refSize * 2.2;
    }
    if (trLines.length) {
      const ts = trSize * scaleTr;
      ctx.font = `${ts}px ${UI_FONT}`;
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.globalAlpha = d.translation.opacity;
      ctx.fillStyle = d.translation.color;
      if (d.shadow.enabled) {
        ctx.shadowColor = hexA("#000000", 0.5);
        ctx.shadowBlur = 8 * u;
      }
      trLines.forEach((l, i) => ctx.fillText(l, W / 2, y + ts * 0.8 + i * ts * 1.5));
      ctx.globalAlpha = 1;
      ctx.shadowColor = "transparent";
    }
  }

  // Audio visualisation — driven only by real analyser data.
  if (d.visualizer.enabled && f.levels) {
    const n = 48;
    const vw = W * 0.6;
    const vh = d.visualizer.size * u;
    const baseY = d.visualizer.position === "top" ? H * 0.06 + vh : H * 0.94 - 40 * u;
    const step = Math.floor(f.levels.length / n) || 1;
    ctx.save();
    ctx.fillStyle = hexA(d.visualizer.color, 0.8);
    ctx.strokeStyle = hexA(d.visualizer.color, 0.85);
    ctx.lineWidth = Math.max(2, 3 * u);
    if (d.visualizer.style === "bars") {
      const bw = vw / n;
      for (let i = 0; i < n; i++) {
        const v = f.levels[i * step] / 255;
        const h = Math.max(2 * u, v * vh);
        ctx.fillRect(W / 2 - vw / 2 + i * bw + bw * 0.2, baseY - h, bw * 0.6, h);
      }
    } else {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const v = f.levels[i * step] / 255;
        const x = W / 2 - vw / 2 + (i / (n - 1)) * vw;
        const yy = baseY - vh / 2 - (v - 0.15) * (vh / 2) * Math.sin(i * 0.9);
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Watermark (Athar Kareem branding)
  if (d.watermark.enabled) {
    const s = d.watermark.size * u;
    const m = 64 * u;
    ctx.save();
    ctx.globalAlpha = d.watermark.opacity;
    ctx.font = `600 ${s * 0.62}px ${UI_FONT}`;
    ctx.direction = "rtl";
    const label = "أثر كريم";
    const tw = ctx.measureText(label).width;
    const total = s + s * 0.3 + tw;
    const right = d.watermark.position.endsWith("right");
    const top = d.watermark.position.startsWith("top");
    const x0 = right ? W - m - total : m;
    const yc = top ? m + s / 2 : H - m - s / 2;
    if (a.logo) ctx.drawImage(a.logo, x0 + tw + s * 0.3, yc - s / 2, s, s);
    ctx.fillStyle = "#F8FAFC";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.direction = "ltr";
    ctx.fillText(label, x0, yc);
    ctx.restore();
  }
  ctx.restore();
}

const FONT_SAMPLE = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ";
let fontsReady: Promise<void> | null = null;
/** Canvas cannot lazy-load web fonts — load every Quran/UI face before drawing. */
export function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    const faces = ['"Amiri Quran"', '"Scheherazade New"', '"Amiri"', '"Noto Naskh Arabic"', '"IBM Plex Sans Arabic"', '600 20px "IBM Plex Sans Arabic"'];
    fontsReady = Promise.all(
      faces.map((f) => document.fonts.load(f.includes("px") ? f : `40px ${f}`, FONT_SAMPLE + " Aa").catch(() => [])),
    ).then(() => undefined);
  }
  return fontsReady;
}

let logoImg: Promise<HTMLImageElement | null> | null = null;
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoImg) {
    logoImg = new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = "/logo.svg";
    });
  }
  return logoImg;
}
