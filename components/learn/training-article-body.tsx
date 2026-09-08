import React from "react";
import { Alert } from "../ui/feedback";
import type { TrainingSection } from "../../lib/training/content";

/** Renders a fixed set of section kinds (heading/paragraph/code/callout/list), never raw
 * HTML -- a content author writing an article cannot introduce an XSS surface, since
 * there is no "arbitrary markup" section kind to write one into (docs/decisions/0066). */
export function TrainingArticleBody({ sections }: { sections: TrainingSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        switch (section.kind) {
          case "heading":
            return (
              <h2 key={index} className="text-base font-semibold text-ink">
                {section.text}
              </h2>
            );
          case "paragraph":
            return (
              <p key={index} className="text-sm leading-relaxed text-ink-muted">
                {section.text}
              </p>
            );
          case "code":
            return (
              <pre key={index} className="overflow-x-auto rounded-lg border border-border bg-surface-muted p-4 text-xs">
                <code className="font-mono text-ink">{section.code}</code>
              </pre>
            );
          case "list":
            return (
              <ul key={index} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-muted">
                {section.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          case "callout":
            return (
              <Alert key={index} tone={section.tone === "warning" ? "warning" : "info"} title={section.tone === "warning" ? "Before you try this" : "Worth knowing"}>
                {section.text}
              </Alert>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
