"use client";

import React, { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pending?: boolean };

// Tactical Telemetry: no glow and no shadow (both prohibited by the brutalist skill) --
// hover is a flat fill/border change, press feedback is `active:scale-[0.96]`, within the
// 150-250ms micro-interaction budget. `motion-reduce:` guards every transform/transition
// so a reduced-motion user gets the resting/pressed states with no animation.
// Every `hover:` rule is gated behind `(hover: hover) and (pointer: fine)` -- a touch
// device simulates `:hover` on tap (and doesn't reliably un-hover on tap-away), which
// left buttons visibly "stuck" in their hover background/glow after a tap on a phone or
// tablet; a mouse/trackpad user is unaffected since that media query is always true there.
const HOVER = "[@media(hover:hover)_and_(pointer:fine)]:hover" as const;
const styles: Record<ButtonVariant, string> = {
  primary: `bg-action text-on-action ${HOVER}:bg-action-hover active:scale-[0.96] motion-reduce:active:scale-100`,
  secondary: `border border-border-strong bg-surface text-ink ${HOVER}:border-ink ${HOVER}:bg-surface-muted active:scale-[0.96] motion-reduce:active:scale-100`,
  quiet: `text-ink ${HOVER}:bg-surface-muted active:scale-[0.96] motion-reduce:active:scale-100`,
  // Destructive is an outlined red slab, not a second solid-red fill: primary already
  // owns the solid hazard-red fill, and two identical red buttons side by side (e.g.
  // "Add" next to "Remove") would make the dangerous one indistinguishable.
  destructive: `border-2 border-danger bg-transparent text-danger ${HOVER}:bg-danger ${HOVER}:text-on-danger active:scale-[0.96] motion-reduce:active:scale-100`,
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", pending = false, disabled, children, type = "button", ...props }, ref,
) {
  // Tactical Telemetry: uppercase, tracked JetBrains Mono labels (the skill's micro-type
  // rule for controls). Corners/shadows are enforced flat globally in globals.css.
  return <button ref={ref} type={type} disabled={disabled || pending} className={cn("inline-flex min-h-11 items-center justify-center gap-2 px-4 font-mono text-xs font-bold uppercase tracking-[0.08em] transition-[transform,background-color,border-color,filter] duration-200 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-55", styles[variant], className)} {...props}>
    {pending && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
    {children}
  </button>;
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton({ label, className, children, ...props }, ref) {
  return <Button ref={ref} aria-label={label} title={label} className={cn("min-h-11 min-w-11 px-2", className)} {...props}>{children}</Button>;
});
