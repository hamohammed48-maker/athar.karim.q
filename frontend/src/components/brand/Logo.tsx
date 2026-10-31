import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("size-9", className)} aria-hidden="true">
      <g fill="none" stroke="#E7B85C" strokeWidth="2.2" strokeLinejoin="round">
        <rect x="14" y="14" width="36" height="36" rx="2" />
        <rect x="14" y="14" width="36" height="36" rx="2" transform="rotate(45 32 32)" />
        <path d="M24 42V31a8 8 0 0 1 16 0v11" />
        <path d="M21 42h22" />
      </g>
      <circle cx="32" cy="24" r="1.8" fill="#E7B85C" />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2" data-testid="app-logo">
      <LogoMark className={compact ? "size-8" : "size-10"} />
      <span className="font-quran text-2xl leading-none text-gold">أثر كريم</span>
    </span>
  );
}
