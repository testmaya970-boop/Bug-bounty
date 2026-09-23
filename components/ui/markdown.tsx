import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/cn";

// Every element gets its Tailwind styling explicitly here (the app's existing
// utility-first convention, matching components/ui/form.tsx etc.) rather than a
// separate global .prose stylesheet -- this is the one place report/comment Markdown
// is styled, so every call site stays visually consistent for free.
const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap break-words text-sm text-ink [&:not(:first-child)]:mt-3">{children}</p>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-action underline underline-offset-2 hover:text-action-hover">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  h1: ({ children }) => <h3 className="mt-4 text-base font-semibold text-ink first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 text-base font-semibold text-ink first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-sm font-semibold text-ink first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="mt-3 border-l-2 border-border-strong pl-3 text-sm text-ink-muted first:mt-0">{children}</blockquote>,
  hr: () => <hr className="my-4 border-border" />,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  table: ({ children }) => (
    <div className="mt-3 overflow-x-auto first:mt-0">
      <table className="min-w-full divide-y divide-border border border-border text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-border bg-surface-muted px-2 py-1 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</th>,
  td: ({ children }) => <td className="border-b border-border px-2 py-1 text-ink">{children}</td>,
  code: ({ className, children }) => {
    // remark treats an inline `code` span and a fenced ``` block identically at the
    // element level -- the only real signal is whether rehype attached a
    // `language-*` class (fenced code always gets one via remark-gfm's info string,
    // inline spans never do), the same detection every react-markdown code-block
    // recipe uses.
    const isBlock = /language-/.test(className ?? "");
    if (!isBlock) return <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[0.85em] text-ink">{children}</code>;
    return <code className={className}>{children}</code>;
  },
  pre: ({ children }) => <pre className="mt-3 overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-xs text-ink first:mt-0">{children}</pre>,
};

/**
 * Renders researcher/organization-authored Markdown (report description, impact,
 * evidence, comments, retest/mediation notes -- see the field list this component's
 * callers cover) the same way HackerOne/Bugcrowd do: GFM (fenced code, tables,
 * strikethrough, autolinks) via remark-gfm, never raw HTML -- react-markdown renders
 * to React elements only and drops any literal `<tag>` the author typed as inert text,
 * so no separate sanitizer is needed. Replaces the old raw `whitespace-pre-wrap` <p>/
 * <pre> rendering everywhere a report/comment field is shown; plain text with no
 * Markdown syntax renders identically to before (a paragraph of literal text).
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
