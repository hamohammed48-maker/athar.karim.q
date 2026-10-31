import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { getProject, getTemplate, putProject, storageErrorMessage, uid, type StudioProject } from "@/lib/persistence/stores";
import { applyBuiltin, BUILTIN_TEMPLATES, defaultDesign, sanitizeDesign, type DesignSettings } from "@/lib/rendering/design";
import { getSettings } from "@/lib/settings";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";
const KEY_RE = /^\d{1,3}:\d{1,3}$/;
export const MAX_VERSES = 40;

function newDesign(): DesignSettings {
  const s = getSettings();
  const d = defaultDesign();
  d.aspect = s.defaultAspect;
  d.export.resolution = s.defaultResolution;
  d.watermark.enabled = s.defaultWatermark;
  return d;
}

/**
 * Loads or creates the studio project from the URL (?project | ?verses | ?template | ?new).
 * Autosave policy: the open project is written to IndexedDB 1.2 s after the last change,
 * only once it contains at least one verse. A new project always gets a new id.
 */
export function useStudioProject(getThumbnail: () => string | null) {
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const [project, setProject] = useState<StudioProject | null>(null);
  const [sourceTemplate, setSourceTemplate] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const handled = useRef<string | null>(null);
  const createdId = useRef<string | null>(null);
  const dirty = useRef(false);
  const thumbRef = useRef(getThumbnail);
  thumbRef.current = getThumbnail;

  useEffect(() => {
    const sig = sp.toString();
    const pid = sp.get("project");
    if (pid && (project?.id === pid || createdId.current === pid)) return;
    if (handled.current === sig) return;
    handled.current = sig;
    setError(null);
    (async () => {
      if (pid) {
        const p = await getProject(pid).catch(() => undefined);
        if (!p) { setError("لم يُعثر على هذا المشروع على هذا الجهاز."); return; }
        setProject({ ...p, design: sanitizeDesign(p.design) });
        setStatus("saved");
        return;
      }
      const keys = [...new Set((sp.get("verses") ?? "").split(",").filter((k) => KEY_RE.test(k)))].slice(0, MAX_VERSES);
      let design = newDesign();
      const tid = sp.get("template");
      const builtin = BUILTIN_TEMPLATES.find((t) => t.id === sp.get("builtin"));
      if (builtin) design = applyBuiltin(design, builtin);
      if (tid) {
        const t = await getTemplate(tid).catch(() => undefined);
        if (t) {
          design = sanitizeDesign(t.design);
          if (sp.get("edit")) setSourceTemplate({ id: t.id, name: t.name });
        }
      }
      const now = Date.now();
      const p: StudioProject = {
        id: uid(), name: `مشروع ${new Intl.DateTimeFormat("ar", { dateStyle: "short", timeStyle: "short" }).format(now)}`,
        verseKeys: keys, reciterId: getSettings().reciterId, design, thumbnail: null, createdAt: now, updatedAt: now,
      };
      dirty.current = keys.length > 0;
      setProject(p);
      setStatus(keys.length ? "pending" : "idle");
      createdId.current = p.id;
      setSp({ project: p.id }, { replace: true });
    })();
  }, [sp, setSp, project?.id]);

  const update = useCallback((fn: (p: StudioProject) => StudioProject) => {
    setProject((p) => (p ? fn(p) : p));
    dirty.current = true;
    setStatus("pending");
  }, []);

  const setDesign = useCallback((fn: (d: DesignSettings) => DesignSettings) => update((p) => ({ ...p, design: fn(p.design) })), [update]);

  useEffect(() => {
    if (!project || !dirty.current || project.verseKeys.length === 0) return;
    const t = setTimeout(async () => {
      setStatus("saving");
      try {
        const saved = { ...project, thumbnail: thumbRef.current() ?? project.thumbnail, updatedAt: Date.now() };
        await putProject(saved);
        dirty.current = false;
        setStatus("saved");
        qc.invalidateQueries({ queryKey: ["idb", "projects"] });
      } catch (e) {
        setStatus("error");
        setError(null);
        console.warn(storageErrorMessage(e));
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [project, qc]);

  return { project, update, setDesign, status, error, sourceTemplate };
}
