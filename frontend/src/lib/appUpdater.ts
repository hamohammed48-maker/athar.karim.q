import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

const OWNER = "hamohammed48-maker";
const REPOSITORY = "athar.karim.q";
export const APP_VERSION = "1.0.2";

type ReleaseAsset = { name: string; size: number; browser_download_url: string };
type GithubRelease = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type ApkInstallerPlugin = {
  installApk(options: { path: string }): Promise<{ permissionRequired?: boolean }>;
};

const ApkInstaller = registerPlugin<ApkInstallerPlugin>("ApkInstaller");

export type AvailableUpdate = {
  version: string;
  notes: string;
  releaseUrl: string;
  downloadUrl: string;
  size: number;
};

function versionParts(value: string): number[] {
  return value.replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return false;
}

export async function checkAppUpdate(): Promise<AvailableUpdate | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    throw new Error("ميزة التحديث متاحة داخل تطبيق أندرويد فقط.");
  }
  const response = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases/latest`,
    { headers: { Accept: "application/vnd.github+json" }, cache: "no-store" },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("تعذّر التحقق من التحديث حالياً. حاول مرة أخرى لاحقاً.");
  const release = (await response.json()) as GithubRelease;
  const apk = release.assets?.find((asset) => asset.name.toLowerCase().endsWith(".apk"));
  if (!apk || !isNewerVersion(release.tag_name, APP_VERSION)) return null;
  return {
    version: release.tag_name.replace(/^v/i, ""),
    notes: release.body || release.name || "تحسينات وإصلاحات عامة.",
    releaseUrl: release.html_url,
    downloadUrl: apk.browser_download_url,
    size: apk.size,
  };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function downloadAndInstallUpdate(
  update: AvailableUpdate,
  onProgress: (percent: number) => void,
): Promise<"permission-required" | "installer-opened"> {
  const response = await fetch(update.downloadUrl, { cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("تعذّر تنزيل ملف التحديث.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress(update.size > 0 ? Math.min(99, Math.round((received / update.size) * 100)) : 0);
    }
  }
  if (!received || (update.size > 0 && received !== update.size)) {
    throw new Error("ملف التحديث غير مكتمل، أعد المحاولة.");
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const saved = await Filesystem.writeFile({
    path: "updates/athar-kareem-update.apk",
    data: toBase64(bytes),
    directory: Directory.Cache,
    recursive: true,
  });
  const file = await Filesystem.getUri({
    path: "updates/athar-kareem-update.apk",
    directory: Directory.Cache,
  });
  onProgress(100);
  const result = await ApkInstaller.installApk({ path: file.uri || saved.uri });
  return result.permissionRequired ? "permission-required" : "installer-opened";
}
