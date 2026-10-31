import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, action, testId }: { title: string; subtitle?: string; action?: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pb-6" data-testid={testId}>
      <div>
        <h1 className="text-[28px] font-bold leading-tight sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function LoadingBlock({ label = "جارٍ التحميل…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex items-center justify-center gap-3 py-12 text-ink-soft", className)} role="status" data-testid="loading-state">
      <Loader2 className="size-5 animate-spin text-gold" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-danger/40 bg-danger/10 px-6 py-8 text-center" role="alert" data-testid="error-state">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-ink">{message}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="error-retry-button">إعادة المحاولة</Button>
      )}
    </div>
  );
}

export function EmptyBlock({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center" data-testid="empty-state">
      <div className="grid size-14 place-items-center rounded-full bg-navy-800 text-gold">{icon}</div>
      <p className="text-lg font-semibold">{title}</p>
      {hint && <p className="max-w-md text-ink-soft">{hint}</p>}
      {action}
    </div>
  );
}

export function Octagon({ n, active }: { n: number | string; active?: boolean }) {
  return (
    <span className="relative grid size-11 shrink-0 place-items-center text-sm font-semibold" aria-hidden>
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full">
        <rect x="8" y="8" width="24" height="24" fill="none" stroke={active ? "#2563EB" : "#E7B85C"} strokeWidth="1.4" />
        <rect x="8" y="8" width="24" height="24" fill="none" stroke={active ? "#2563EB" : "#E7B85C"} strokeWidth="1.4" transform="rotate(45 20 20)" />
      </svg>
      <span className="relative text-ink">{n}</span>
    </span>
  );
}

/** Segmented control used across the app (RTL aware, keyboard accessible). */
export function Segmented<T extends string>({ value, options, onChange, testId, label }: {
  value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; testId: string; label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
          data-testid={`${testId}-${o.id.replace(/[:]/g, "x")}`}
          className={cn("min-h-10 rounded-lg border px-3.5 text-sm transition-colors duration-150",
            value === o.id ? "border-action bg-action text-white" : "border-line bg-navy-900 text-ink-soft hover:border-ink-muted hover:text-ink")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RangeField({ label, value, min, max, step = 1, onChange, testId, format }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; testId: string; format?: (v: number) => string;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between text-sm text-ink-soft">
        <span>{label}</span>
        <span className="tabular-nums text-ink" data-testid={`${testId}-value`}>{format ? format(value) : value}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer" data-testid={testId} aria-label={label} />
    </label>
  );
}

export function ToggleRow({ label, hint, checked, onChange, testId }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; testId: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-ink-muted">{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} data-testid={testId}
        className={cn("relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200", checked ? "border-action bg-action" : "border-line bg-navy-900")}>
        <span className={cn("absolute top-0.5 size-[18px] rounded-full bg-white transition-[inset-inline-start] duration-200", checked ? "start-[22px]" : "start-0.5")} />
        <span className="sr-only">{checked ? "مفعّل" : "معطّل"}</span>
      </button>
    </label>
  );
}

export function ColorField({ label, value, swatches, onChange, testId, onReset }: {
  label: string; value: string; swatches: string[]; onChange: (v: string) => void; testId: string; onReset?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-ink-soft">
        <span>{label}</span>
        {onReset && <button type="button" className="text-xs text-gold hover:underline" onClick={onReset} data-testid={`${testId}-reset`}>استعادة الافتراضي</button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((c) => (
          <button key={c} type="button" onClick={() => onChange(c)} aria-label={`اللون ${c}`} aria-pressed={value.toLowerCase() === c.toLowerCase()}
            data-testid={`${testId}-swatch-${c.slice(1)}`}
            className={cn("size-8 rounded-full border-2 transition-transform duration-150 hover:scale-110",
              value.toLowerCase() === c.toLowerCase() ? "border-action ring-2 ring-action/40" : "border-line")}
            style={{ background: c }} />
        ))}
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} — منتقي الألوان`}
          className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" data-testid={`${testId}-picker`} />
      </div>
    </div>
  );
}
