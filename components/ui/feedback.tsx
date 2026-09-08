import React from "react";
import { cn } from "../../lib/cn";

// Both surfaces use the shared soft-glass treatment (docs/decisions/0062): a mostly-
// opaque tinted fill plus a light backdrop blur plus a thin border
// (`.glass-surface`/`.glass-surface-raised` in app/globals.css), so the ambient warm
// background reads faintly through every card instead of a flat opaque fill.
// `transition-[border-color,box-shadow]` is what lets a caller add
// `hover:border-glass-border-strong` for the "border illumination on hover"
// micro-interaction without redefining the base surface.
export function Card({ className, children }: React.HTMLAttributes<HTMLElement>) { return <section className={cn("glass-surface rounded-lg transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none", className)}>{children}</section>; }
export function Panel({ className, children }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("glass-surface-raised rounded-lg p-4 transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none", className)}>{children}</div>; }
export function Separator({ className }: { className?: string }) { return <hr className={cn("border-0 border-t border-border", className)} />; }
export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "success" | "warning" | "danger"; title: string; children?: React.ReactNode; className?: string }) { const color = { info: "border-info", success: "border-success", warning: "border-warning", danger: "border-danger" }[tone]; return <div role="alert" className={cn("border-l-4 bg-surface-muted p-4 text-sm text-ink", color, className)}><p className="font-semibold">{title}</p>{children && <div className="mt-1 text-ink-muted">{children}</div>}</div>; }
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) { return <section className="glass-surface rounded-lg border-dashed p-8 text-center"><h2 className="text-base font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">{children}</p></section>; }
export function ErrorState({ title = "Something went wrong", children }: { title?: string; children: React.ReactNode }) { return <Alert tone="danger" title={title}>{children}</Alert>; }
export function LoadingState({ label = "Loading" }: { label?: string }) { return <div role="status" className="glass-surface flex min-h-32 items-center justify-center gap-3 rounded-lg text-sm text-ink-muted"><span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-action border-r-transparent motion-reduce:animate-none" />{label}</div>; }

/**
 * A shimmer loading placeholder (docs/decisions/0057) -- preferred over a flat gray block
 * where a screen already knows the real content's rough shape (a row, a stat tile, a
 * chart). `motion-safe:animate-shimmer` is the ONLY thing gated: under
 * `prefers-reduced-motion: reduce` this renders as the flat `bg-surface-muted` fill with
 * no animation property at all, never a slowed-down shimmer. Never used for anything but
 * a loading placeholder -- DESIGN.md's own rule that a stat/number must never animate a
 * placeholder or a mock value applies here too: this is a shape, not a number.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-surface-muted motion-safe:animate-shimmer motion-safe:bg-[linear-gradient(90deg,var(--surface-muted)_25%,var(--surface-hover)_50%,var(--surface-muted)_75%)] motion-safe:bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
export function PermissionDenied({ children = "You do not have permission to view this resource." }: { children?: React.ReactNode }) { return <section className="glass-surface rounded-lg p-6"><h2 className="text-base font-semibold">Permission denied</h2><p className="mt-2 text-sm text-ink-muted">{children}</p></section>; }
