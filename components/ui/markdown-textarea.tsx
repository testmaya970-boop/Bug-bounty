"use client";

import React, { useId, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { Markdown } from "./markdown";
import { Label } from "./form";

type ToolbarAction = { label: string; syntax: string; before: string; after: string; placeholder: string };

// Same four marks HackerOne/Bugcrowd's own report composer toolbar exposes -- bold,
// italic, inline code, and a fenced code block are the ones a vulnerability writeup
// actually uses (a PoC snippet, a request/response body); link covers a reference URL.
// Deliberately not a full WYSIWYG toolbar -- this wraps the *existing* plain textarea,
// it does not replace it.
const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { label: "Bold", syntax: "B", before: "**", after: "**", placeholder: "bold text" },
  { label: "Italic", syntax: "I", before: "_", after: "_", placeholder: "italic text" },
  { label: "Code", syntax: "</>", before: "`", after: "`", placeholder: "code" },
  { label: "Code block", syntax: "{ }", before: "```\n", after: "\n```", placeholder: "paste output or PoC here" },
  { label: "Link", syntax: "🔗", before: "[", after: "](https://)", placeholder: "link text" },
];

type FieldProps = { label: string; helperText?: string; error?: string; required?: boolean; className?: string };

/**
 * The Markdown-aware version of `Textarea` for the fields that behave like HackerOne/
 * Bugcrowd's: report Description/Impact and comment bodies. Same controlled
 * `value`/`onChange` contract as `Textarea` (a drop-in swap), plus a formatting toolbar
 * that wraps the current selection and a Write/Preview toggle that renders through the
 * exact same `<Markdown>` component the report detail page uses -- what a researcher
 * previews here is pixel-identical to what triage will see. Local toggle state only
 * (no `Tabs`/URL state): irrelevant to any other page and reset-per-mount is correct.
 */
export function MarkdownTextarea({
  label,
  helperText,
  error,
  required,
  className,
  value,
  onChange,
  maxLength,
  placeholder,
  rows = 8,
  autoFocus,
}: FieldProps & { value: string; onChange: (value: string) => void; maxLength?: number; placeholder?: string; rows?: number; autoFocus?: boolean }) {
  const generatedId = useId();
  const id = generatedId;
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const describedBy = [helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

  function applyToolbarAction(action: ToolbarAction) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || action.placeholder;
    const next = value.slice(0, start) + action.before + selected + action.after + value.slice(end);
    onChange(next);
    // Re-focus and re-select the inserted text after React commits the new value --
    // a synchronous selectionStart/End set right after onChange would still read the
    // textarea's OLD value's length, so this has to wait a tick.
    requestAnimationFrame(() => {
      textarea.focus();
      const selectionStart = start + action.before.length;
      textarea.setSelectionRange(selectionStart, selectionStart + selected.length);
    });
  }

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="mb-0">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </Label>
        <div role="group" aria-label="Editor mode" className="flex overflow-hidden rounded-md border border-border text-xs font-semibold">
          <button
            type="button"
            aria-pressed={mode === "write"}
            onClick={() => setMode("write")}
            className={cn("px-2.5 py-1 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", mode === "write" ? "bg-action text-on-action" : "bg-surface text-ink-muted hover:text-ink")}
          >
            Write
          </button>
          <button
            type="button"
            aria-pressed={mode === "preview"}
            onClick={() => setMode("preview")}
            className={cn("px-2.5 py-1 transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus", mode === "preview" ? "bg-action text-on-action" : "bg-surface text-ink-muted hover:text-ink")}
          >
            Preview
          </button>
        </div>
      </div>

      {mode === "write" ? (
        <>
          <div className="mb-1.5 flex flex-wrap gap-1 rounded-md border border-border bg-surface-muted p-1">
            {TOOLBAR_ACTIONS.map((action) => (
              <button
                key={action.label}
                type="button"
                title={action.label}
                aria-label={action.label}
                onClick={() => applyToolbarAction(action)}
                className="min-h-8 min-w-8 rounded px-2 text-xs font-semibold text-ink-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {action.syntax}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            id={id}
            autoFocus={autoFocus}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={rows}
            className="min-h-28 w-full rounded-md border border-border bg-surface px-3 py-2.5 font-mono text-sm text-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
          />
        </>
      ) : (
        <div className="min-h-28 rounded-md border border-border bg-surface px-3 py-2.5">
          {value.trim().length > 0 ? <Markdown content={value} /> : <p className="text-sm text-ink-muted">Nothing to preview yet.</p>}
        </div>
      )}
      {helperText && (
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-muted">
          {helperText} Markdown supported.
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
