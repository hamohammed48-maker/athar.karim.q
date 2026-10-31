import { useEffect, useState } from "react";
import { bgUrl, type BackgroundSettings } from "@/lib/rendering/design";
import { loadMedia } from "@/lib/persistence/stores";

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 150 * 1024 * 1024;

/** Validates an untrusted user file. Returns an Arabic error message or null. */
export function validateBackgroundFile(file: File): string | null {
  const isImg = IMAGE_TYPES.includes(file.type);
  const isVid = VIDEO_TYPES.includes(file.type);
  if (!isImg && !isVid) return "نوع الملف غير مدعوم. الصور: JPG / PNG / WEBP — الفيديو: MP4 / WEBM / MOV";
  if (isImg && file.size > MAX_IMAGE_BYTES) return "حجم الصورة يتجاوز 20 م.ب";
  if (isVid && file.size > MAX_VIDEO_BYTES) return "حجم الفيديو يتجاوز 150 م.ب";
  return null;
}

export interface BgAsset {
  el: HTMLImageElement | HTMLVideoElement;
  width: number;
  height: number;
}

export type BgStatus = "none" | "loading" | "ready" | "missing" | "error";

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image"));
    img.src = src;
  });
}

function loadVideo(src: string): Promise<HTMLVideoElement> {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => res(v);
    v.onerror = () => rej(new Error("video"));
    v.src = src;
  });
}

/** Loads exactly one background at a time and releases the previous one (object URL + decoder). */
export function useBackgroundAsset(bg: BackgroundSettings) {
  const [state, setState] = useState<{ asset: BgAsset | null; status: BgStatus }>({ asset: null, status: "none" });
  const key = bg.kind === "builtin" ? `b:${bg.builtinId}` : bg.kind === "color" ? "color" : `${bg.kind}:${bg.mediaId}`;

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    let video: HTMLVideoElement | null = null;
    const run = async () => {
      if (bg.kind === "color") return setState({ asset: null, status: "none" });
      setState((s) => ({ asset: s.asset, status: "loading" }));
      try {
        if (bg.kind === "builtin") {
          const img = await loadImage(bgUrl(bg.builtinId));
          if (!cancelled) setState({ asset: { el: img, width: img.naturalWidth, height: img.naturalHeight }, status: "ready" });
          return;
        }
        const rec = bg.mediaId ? await loadMedia(bg.mediaId) : undefined;
        if (!rec) {
          if (!cancelled) setState({ asset: null, status: "missing" });
          return;
        }
        objectUrl = URL.createObjectURL(rec.blob);
        if (bg.kind === "image") {
          const img = await loadImage(objectUrl);
          if (!cancelled) setState({ asset: { el: img, width: img.naturalWidth, height: img.naturalHeight }, status: "ready" });
        } else {
          video = await loadVideo(objectUrl);
          void video.play().catch(() => undefined);
          if (!cancelled) setState({ asset: { el: video, width: video.videoWidth, height: video.videoHeight }, status: "ready" });
        }
      } catch {
        if (!cancelled) setState({ asset: null, status: "error" });
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
