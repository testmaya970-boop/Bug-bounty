"use client";

import React, { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/cn";

type ButtonVariant = "primary" | "secondary" | "quiet" | "destructive";
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; pending?: boolean };

// docs/decisions/0062's timing budget for functional micro-interactions (150-250ms) --
// hover/press get real depth (scale + a soft green/orange glow), not just a color swap.
// "Magnetic" press feedback is `active:scale-[0.96]` plus a tightened shadow, the same
// fast-repeatable-hundreds-of-times-a-day budget every button already used, just with a
// glow layered on primary/destructive instead of a flat shadow-md. `motion-reduce:`
// guards every transform/transition so a reduced-motion user gets the resting/pressed
// states with no animation. `--glow-action`/danger's own rgba both resolve through the
// current theme's tokens, so this never needs touching if the palette changes again.
const styles: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action shadow-[0_0_0_0_var(--glow-action)] hover:bg-action-hover hover:shadow-[0_0_20px_var(--glow-action)] active:scale-[0.96] motion-reduce:active:scale-100",
  secondary: "border border-border-strong bg-surface/70 text-ink backdrop-blur hover:border-glass-border-strong hover:bg-surface-muted active:scale-[0.96] motion-reduce:active:scale-100",
  quiet: "text-ink hover:bg-surface-muted active:scale-[0.96] motion-reduce:active:scale-100",
  destructive: "bg-danger text-on-danger shadow-[0_0_0_0_rgba(193,64,31,0.3)] hover:brightness-110 hover:shadow-[0_0_20px_rgba(193,64,31,0.3)] active:scale-[0.96] motion-reduce:active:scale-100",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", pending = false, disabled, children, type = "button", ...props }, ref,
) {
  return <button ref={ref} type={type} disabled={disabled || pending} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-200 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-55", styles[variant], className)} {...props}>
    {pending && <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" />}
    {children}
  </button>;
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton({ label, className, children, ...props }, ref) {
  return <Button ref={ref} aria-label={label} title={label} className={cn("min-h-11 min-w-11 px-2", className)} {...props}>{children}</Button>;
});
