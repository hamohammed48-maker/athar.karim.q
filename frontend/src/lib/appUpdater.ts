import { Capacitor, registerPlugin } from "@capacitor/core";

const OWNER = "hamohammed48-maker";
const REPOSITORY = "athar.karim.q";
export const APP_VERSION = "1.0.5";

type ReleaseAsset = { name: string; size: number; browser_download_url: string };
type GithubRelease = {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type ApkInstallerPlugin = {
  downloadApk(options: { url: string; expectedSize: number }): Promise<{ path: string }>;
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
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return null;
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

export async function downloadAndInstallUpdate(
  update: AvailableUpdate,
  onProgress: (percent: number) => void,
): Promise<"permission-required" | "installer-opened"> {
  onProgress(0);
  const downloaded = await ApkInstaller.downloadApk({
    url: update.downloadUrl,
    expectedSize: update.size,
  });
  onProgress(100);
  const result = await ApkInstaller.installApk({ path: downloaded.path });
  return result.permissionRequired ? "permission-required" : "installer-opened";
}
