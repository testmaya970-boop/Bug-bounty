"use client";

import React, { forwardRef, useId, useState } from "react";
import { Label } from "../ui/form";

const inputClass =
  "min-h-11 w-full rounded-md border border-border bg-surface px-3 pr-16 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

// Literal class strings, one per level -- never runtime-derived (e.g. via string
// concatenation from the level number), which is exactly the Tailwind static-scan bug
// found and fixed elsewhere in this codebase (components/ui/badge.tsx's own history):
// a class name Tailwind can't find as literal text in the source is silently never
// generated, no error, just invisible color.
const STRENGTH_BAR_COLOR: Record<1 | 2 | 3 | 4, string> = { 1: "bg-danger", 2: "bg-warning", 3: "bg-info", 4: "bg-success" };

type PasswordInputProps = {
  label: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  autoComplete: "current-password" | "new-password" | "off";
  minLength?: number;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  /** Rendered beside the label, e.g. a "Forgot password?" link on the sign-in field. */
  labelExtra?: React.ReactNode;
  /** A real, length-derived strength level (0-4, see passwordStrengthLevel) -- only ever
   * passed for a *new* password (signup, reset), never sign-in. Renders a segmented bar
   * alongside passwordStrengthLabel's own text, never a second, disagreeing signal. */
  strengthLevel?: 0 | 1 | 2 | 3 | 4;
};

/** Toggling `type` between "password"/"text" never touches `value` and is a plain
 * `type="button"` (never submits the form) -- a real password manager keys off the
 * input's `type="password"`/`autoComplete` attributes at the moment it offers to fill,
 * not some later toggle, so switching visibility after the fact does not interfere with
 * autofill. Paste is never blocked (no onPaste handler exists here at all). Text label,
 * not an icon -- matches this product's own "prefer text over icons" convention. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, helperText, error, required, autoComplete, minLength, value, onChange, labelExtra, strengthLevel },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const describedBy = [helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id} className="mb-1.5">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </Label>
        {labelExtra}
      </div>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          minLength={minLength}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          value={value}
          onChange={onChange}
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 px-3 text-xs font-semibold uppercase tracking-wide text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {strengthLevel !== undefined && strengthLevel > 0 && (() => {
        const level = strengthLevel as 1 | 2 | 3 | 4;
        return (
          <div className="mt-1.5 flex gap-1" aria-hidden="true">
            {([1, 2, 3, 4] as const).map((segment) => (
              <span key={segment} className={`h-1 flex-1 rounded-full ${segment <= level ? STRENGTH_BAR_COLOR[level] : "bg-border"}`} />
            ))}
          </div>
        );
      })()}
      {helperText && (
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-muted">
          {helperText}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

/** Length-first, per current OWASP/NIST guidance -- composition rules (forced symbols,
 * digits, mixed case) are deliberately not part of this or the actual auth system
 * (supabase/config.toml's own `password_requirements = ""`): length is the primary real
 * strength signal, and inventing a fake composition requirement this codebase does not
 * enforce would just train users to pick a weaker password that merely satisfies a
 * pattern. Thresholds match the real, backend-enforced minimum (12 -- see
 * supabase/config.toml, docs/decisions/0053) exactly: "Too short" is not a suggestion,
 * it is what the server will actually reject. */
export function passwordStrengthLabel(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < 12) return "Too short";
  if (password.length < 16) return "Fair";
  if (password.length < 20) return "Good";
  return "Strong";
}

/** The same real thresholds as passwordStrengthLabel, as a 0-4 level for
 * PasswordInput's segmented bar -- one function, two presentations, never two
 * independently-maintained scoring rules that could drift apart. */
export function passwordStrengthLevel(password: string): 0 | 1 | 2 | 3 | 4 {
  if (password.length === 0) return 0;
  if (password.length < 12) return 1;
  if (password.length < 16) return 2;
  if (password.length < 20) return 3;
  return 4;
}
