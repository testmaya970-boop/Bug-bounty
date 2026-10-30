"use client";

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Label } from "./form";

type FormatAction = { label: string; before: string; after: string; placeholder: string; block?: boolean };

// Keyboard formatting instead of a toolbar: select text and press the shortcut, the way writing
// tools work. Ctrl on Windows/Linux, Cmd on a Mac; pressing it again removes the marks. The marks
// are the Markdown the report page renders: bold, italic, inline code, a fenced code block (a PoC
// or a request/response body) and a link.
const SHORTCUTS: { key: string; shift?: boolean; action: FormatAction }[] = [
  { key: "b", action: { label: "Bold", before: "**", after: "**", placeholder: "bold text" } },
  { key: "i", action: { label: "Italic", before: "_", after: "_", placeholder: "italic text" } },
  { key: "e", action: { label: "Code", before: "`", after: "`", placeholder: "code" } },
  { key: "e", shift: true, action: { label: "Code block", before: "```\n", after: "\n```", placeholder: "paste output or PoC here", block: true } },
  { key: "k", action: { label: "Link", before: "[", after: "](https://)", placeholder: "link text" } },
];

/** Wraps value[start, end) in the action's marks. A block (a code fence) must sit on its own
 * lines, so a newline is added before/after when the selection starts or ends mid-line;
 * a fence glued to other text is not a code block at all. Returns the new value and the
 * range of the wrapped text, to re-select it. */
export function applyMarks(value: string, start: number, end: number, action: Pick<FormatAction, "before" | "after" | "placeholder" | "block">) {
  const selected = value.slice(start, end) || action.placeholder;
  const lead = action.block && start > 0 && value[start - 1] !== "\n" ? "\n" : "";
  const trail = action.block && end < value.length && value[end] !== "\n" ? "\n" : "";
  const prefix = lead + action.before;
  return {
    next: value.slice(0, start) + prefix + selected + action.after + trail + value.slice(end),
    selectionStart: start + prefix.length,
    selectionEnd: start + prefix.length + selected.length,
  };
}

/** The edit a shortcut makes: wrap the selection, or unwrap it when it is already wrapped (the
 * marks sit just outside the selection, or the selection itself starts and ends with them).
 * Returns the range to replace, its new text, and the selection to restore. */
export function formatSelection(value: string, start: number, end: number, action: Pick<FormatAction, "before" | "after" | "placeholder" | "block">) {
  const { before, after } = action;
  if (start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    const inner = value.slice(start, end);
    return { from: start - before.length, to: end + after.length, text: inner, selectionStart: start - before.length, selectionEnd: start - before.length + inner.length };
  }
  const selected = value.slice(start, end);
  if (selected.length >= before.length + after.length && selected.startsWith(before) && selected.endsWith(after)) {
    const inner = selected.slice(before.length, selected.length - after.length);
    return { from: start, to: end, text: inner, selectionStart: start, selectionEnd: start + inner.length };
  }
  const { next, selectionStart, selectionEnd } = applyMarks(value, start, end, action);
  return { from: start, to: end, text: next.slice(start, next.length - (value.length - end)), selectionStart, selectionEnd };
}

const MARK = "text-ink-muted/70";
const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\n]*\))|((?<![\w*])_[^_\n]+_(?![\w]))/g;

/** Styles one line's inline Markdown. The marks stay visible (dimmed) so every character keeps
 * its place: this layer sits under a transparent textarea and must line up with its caret. */
function inline(line: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    const [text] = m;
    const at = m.index;
    if (at > last) out.push(line.slice(last, at));
    const k = `${key}-${at}`;
    if (m[1]) out.push(<code key={k} className="rounded-sm bg-ink/10 text-ink"><span className={MARK}>`</span>{text.slice(1, -1)}<span className={MARK}>`</span></code>);
    else if (m[2]) out.push(<strong key={k} className="font-bold"><span className={MARK}>**</span>{text.slice(2, -2)}<span className={MARK}>**</span></strong>);
    else if (m[3]) {
      const split = text.indexOf("](");
      out.push(<span key={k}><span className={MARK}>[</span><span className="text-action underline">{text.slice(1, split)}</span><span className={MARK}>{text.slice(split)}</span></span>);
    } else out.push(<em key={k}><span className={MARK}>_</span>{text.slice(1, -1)}<span className={MARK}>_</span></em>);
    last = at + text.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

/** The live-formatted copy of the text drawn behind the textarea. Rendered as React text
 * nodes, never HTML, so whatever is typed (a `<script>` payload included) stays inert text. */
export function highlightMarkdown(value: string): React.ReactNode[] {
  let fenced = false;
  return value.split("\n").map((line, i) => {
    const nl = i > 0 ? "\n" : "";
    if (line.startsWith("```")) {
      fenced = !fenced;
      return <React.Fragment key={i}>{nl}<span className={MARK}>{line}</span></React.Fragment>;
    }
    if (fenced) return <React.Fragment key={i}>{nl}<span className="bg-ink/10">{line}</span></React.Fragment>;
    if (/^#{1,6}\s/.test(line)) return <React.Fragment key={i}>{nl}<strong className="font-bold">{line}</strong></React.Fragment>;
    return <React.Fragment key={i}>{nl}{inline(line, String(i))}</React.Fragment>;
  });
}

type FieldProps = { label: string; helperText?: string; error?: string; required?: boolean; className?: string };

/**
 * The Markdown-aware version of `Textarea` for report Description/Impact and comment bodies.
 * Same controlled `value`/`onChange` contract as `Textarea` (a drop-in swap). Formatting shows
 * live while typing (bold looks bold, code looks like code) and is applied with keyboard
 * shortcuts (Ctrl/Cmd+B, I, E, Shift+E, K on the selection). The stored value stays plain
 * Markdown, which the report page renders through `<Markdown>`.
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // The textarea grows with its text instead of scrolling, so the formatted layer behind it
  // never has to follow a scroll position or a scrollbar's width.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);
  const describedBy = [helperText && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  const mod = mac ? "⌘" : "Ctrl+";

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const shortcut = SHORTCUTS.find((s) => s.key === event.key.toLowerCase() && Boolean(s.shift) === event.shiftKey);
    if (!shortcut) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const edit = formatSelection(textarea.value, textarea.selectionStart, textarea.selectionEnd, shortcut.action);
    textarea.setSelectionRange(edit.from, edit.to);
    // insertText keeps the change on the browser's undo stack (Ctrl+Z undoes the formatting) and
    // fires a normal input event, so onChange runs as for typing. Where it is unavailable, set
    // the value directly.
    const inserted = typeof document.execCommand === "function" && document.execCommand("insertText", false, edit.text);
    if (!inserted) onChange(textarea.value.slice(0, edit.from) + edit.text + textarea.value.slice(edit.to));
    requestAnimationFrame(() => textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd));
  }

  return (
    <div className={className}>
      <Label htmlFor={id} className="mb-1.5">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </Label>
      <div className="relative rounded-md bg-surface">
        <div
          aria-hidden="true"
          data-testid="markdown-live"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-md border border-transparent px-3 py-2.5 font-mono text-sm text-ink"
        >
          {highlightMarkdown(value)}
          {/* keeps a trailing empty line the same height as in the textarea */}{" "}
        </div>
        <textarea
            ref={textareaRef}
            id={id}
            autoFocus={autoFocus}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={describedBy}
            aria-keyshortcuts={mac ? "Meta+B Meta+I Meta+E Meta+Shift+E Meta+K" : "Control+B Control+I Control+E Control+Shift+E Control+K"}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={maxLength}
            placeholder={placeholder}
            rows={rows}
            className="relative block min-h-28 w-full resize-none overflow-hidden whitespace-pre-wrap break-words rounded-md border border-border bg-transparent px-3 py-2.5 font-mono text-sm text-transparent caret-ink outline-none placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/30"
          />
      </div>
      <p className="mt-1 text-[11px] text-ink-muted">
        Select text and press <kbd className="font-mono">{mod}B</kbd> bold, <kbd className="font-mono">{mod}I</kbd> italic, <kbd className="font-mono">{mod}E</kbd> code,{" "}
        <kbd className="font-mono">{mod}{mac ? "⇧" : "Shift+"}E</kbd> code block, <kbd className="font-mono">{mod}K</kbd> link. Press again to remove.
      </p>
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
