import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTemplate, uid, useTemplateMutations } from "@/lib/persistence/stores";
import type { DesignSettings } from "@/lib/rendering/design";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  design: DesignSettings;
  thumbnail: string | null;
  sourceTemplate: { id: string; name: string } | null;
}

export function SaveTemplateDialog({ open, onOpenChange, design, thumbnail, sourceTemplate }: Props) {
  const { save } = useTemplateMutations();
  const hasMedia = design.background.kind === "image" || design.background.kind === "video";
  const [name, setName] = useState("");
  const [withMedia, setWithMedia] = useState(true);
  const [overwrite, setOverwrite] = useState(true);

  useEffect(() => {
    if (open) { setName(sourceTemplate?.name ?? ""); setWithMedia(hasMedia); setOverwrite(!!sourceTemplate); }
  }, [open, sourceTemplate, hasMedia]);

  const submit = async () => {
    const n = name.trim();
    if (!n) { toast.error("أدخل اسماً للنموذج"); return; }
    const d: DesignSettings = JSON.parse(JSON.stringify(design));
    if (hasMedia && !withMedia) d.background = { ...d.background, kind: "builtin", builtinId: "night-mosque", mediaId: null, mediaName: null };
    const now = Date.now();
    const existing = overwrite && sourceTemplate ? await getTemplate(sourceTemplate.id) : undefined;
    await save.mutateAsync({
      id: existing?.id ?? uid(), name: n, design: d, thumbnail, includesMedia: hasMedia && withMedia,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    });
    toast.success(existing ? "حُدّث النموذج" : "حُفظ النموذج في «نماذجي المحفوظة»");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" dir="rtl" data-testid="save-template-dialog">
        <DialogHeader>
          <DialogTitle>حفظ النموذج</DialogTitle>
          <DialogDescription>يُحفظ التصميم فقط (الخط، الألوان، الظل، التتبع، الترجمة، العلامة المائية، المؤثرات، الخلفية والأبعاد) دون الآيات أو القارئ.</DialogDescription>
        </DialogHeader>
        {thumbnail && <img src={thumbnail} alt="معاينة النموذج" className="mx-auto max-h-56 rounded-lg border border-line" data-testid="save-template-preview" />}
        <div className="space-y-2">
          <Label htmlFor="tpl-name">اسم النموذج</Label>
          <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="مثال: تصميم الغروب" className="h-11" data-testid="save-template-name-input" />
        </div>
        {hasMedia && (
          <fieldset className="space-y-2" role="radiogroup">
            <legend className="mb-1 text-sm text-ink-soft">الخلفية</legend>
            {[{ v: true, l: "حفظ الإعدادات مع الخلفية المختارة", h: "يُحفظ الملف على هذا الجهاز فقط" }, { v: false, l: "حفظ الإعدادات فقط", h: "تُستبدل الخلفية بخلفية مدمجة" }].map((o) => (
              <button key={String(o.v)} type="button" role="radio" aria-checked={withMedia === o.v} onClick={() => setWithMedia(o.v)} data-testid={`save-template-media-${o.v ? "with" : "without"}`}
                className={cn("w-full rounded-xl border p-3 text-start", withMedia === o.v ? "border-action bg-action/10" : "border-line")}>
                <span className="block text-sm">{o.l}</span><span className="block text-xs text-ink-muted">{o.h}</span>
              </button>
            ))}
          </fieldset>
        )}
        {sourceTemplate && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} className="size-4 accent-[#2563EB]" data-testid="save-template-overwrite" />
            تحديث «{sourceTemplate.name}» بدلاً من إنشاء نموذج جديد
          </label>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="save-template-cancel">إلغاء</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="save-template-confirm">حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
