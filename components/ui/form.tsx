"use client";

import React, { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "../../lib/cn";

type FieldProps = { label: string; helperText?: string; error?: string; required?: boolean; className?: string };
const inputClass = "min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-70";

function FieldNote({ id, helperText, error }: { id: string; helperText?: string; error?: string }) {
  return <>{helperText && <p id={`${id}-help`} className="mt-1 text-xs text-ink-muted">{helperText}</p>}{error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}</>;
}

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input({ label, helperText, error, required, className, id: suppliedId, ...props }, ref) {
  const generatedId = useId(); const id = suppliedId ?? generatedId;
  const describedBy = [helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className={className}><Label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</Label><input ref={ref} id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={inputClass} {...props} /><FieldNote id={id} helperText={helperText} error={error} /></div>;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea({ label, helperText, error, required, className, id: suppliedId, ...props }, ref) {
  const generatedId = useId(); const id = suppliedId ?? generatedId;
  const describedBy = [helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  return <div className={className}><Label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</Label><textarea ref={ref} id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={describedBy} className={cn(inputClass, "min-h-28 py-2.5")} {...props} /><FieldNote id={id} helperText={helperText} error={error} /></div>;
});

export function Select({ label, helperText, error, required, className, id: suppliedId, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & FieldProps) {
  const generatedId = useId(); const id = suppliedId ?? generatedId;
  return <div className={className}><Label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</Label><select id={id} required={required} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : helperText ? `${id}-help` : undefined} className={inputClass} {...props}>{children}</select><FieldNote id={id} helperText={helperText} error={error} /></div>;
}

export function Checkbox({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { const generatedId = useId(); const fieldId = id ?? generatedId; return <div className="flex min-h-11 items-center gap-2"><input id={fieldId} type="checkbox" className="size-4 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" {...props} /><Label htmlFor={fieldId} className="mb-0">{label}</Label></div>; }

/** A real, fixed-vocabulary multi-select -- every checklist in this codebase (interests,
 * tools, security focus, program focus areas) shares this one implementation rather than
 * four hand-rolled copies. `values`/`onChange` hold the checked subset of `options`. */
export function CheckboxGroup<T extends string>({ legend, helperText, options, labels, values, onChange }: { legend: string; helperText?: string; options: readonly T[]; labels: Record<T, string>; values: T[]; onChange: (values: T[]) => void }) {
  function toggle(option: T) {
    onChange(values.includes(option) ? values.filter((v) => v !== option) : [...values, option]);
  }
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      {helperText && <p className="mb-2 text-xs text-ink-muted">{helperText}</p>}
      <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        {options.map((option) => (
          <Checkbox key={option} label={labels[option]} checked={values.includes(option)} onChange={() => toggle(option)} />
        ))}
      </div>
    </fieldset>
  );
}
export function Radio({ label, id, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) { const generatedId = useId(); const fieldId = id ?? generatedId; return <div className="flex min-h-11 items-center gap-2"><input id={fieldId} type="radio" className="size-4 accent-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" {...props} /><Label htmlFor={fieldId} className="mb-0">{label}</Label></div>; }
// Two real fixes here: the track used the `transition` shorthand (banned -- names no
// property, so it was also transitioning box-shadow/border on every focus-visible change
// for free) and the knob animated via `left`, a layout-triggering property, when its
// on/off travel is a fixed distance a `transform: translateX()` expresses for free with
// no layout cost. State-indication purpose (on/off is now legible), occasional-to-tens-
// per-day frequency (a settings toggle, not a keyboard shortcut) -- a standard,
// fast transition is warranted, not "no animation."
export function Switch({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (checked: boolean) => void; id?: string }) { const generatedId = useId(); const fieldId = id ?? generatedId; return <div className="flex min-h-11 items-center justify-between gap-3"><Label htmlFor={fieldId} className="mb-0">{label}</Label><button id={fieldId} type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("relative h-6 w-11 rounded-full transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus", checked ? "bg-action" : "bg-border-strong")}><span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform duration-150 ease-out motion-reduce:transition-none", checked ? "translate-x-5" : "translate-x-0")} /></button></div>; }
