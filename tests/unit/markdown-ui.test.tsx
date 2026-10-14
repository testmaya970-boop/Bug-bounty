import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../../components/ui/markdown";
import { applyMarks } from "../../components/ui/markdown-textarea";

describe("Markdown: researcher-written content", () => {
  it("renders a safe link as a link that opens in a new tab", () => {
    const html = renderToStaticMarkup(<Markdown content="[docs](https://example.com)" />);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("shows an unsafe link (javascript:) as plain text, not a dead or live link", () => {
    const html = renderToStaticMarkup(<Markdown content="[clickme](javascript:alert(3))" />);
    expect(html).toContain("clickme");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("javascript:");
  });

  it("never renders raw HTML", () => {
    const html = renderToStaticMarkup(<Markdown content={'<img src=x onerror="alert(1)"><script>alert(2)</script>'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
  });
});

describe("Markdown editor toolbar: applyMarks", () => {
  const fence = { before: "```\n", after: "\n```", placeholder: "code", block: true };

  it("puts a code block on its own lines when applied mid-line", () => {
    const value = "see curl -i /x here";
    const start = value.indexOf("curl");
    const end = start + "curl -i /x".length;
    const { next } = applyMarks(value, start, end, fence);
    expect(next).toBe("see \n```\ncurl -i /x\n```\n here");
  });

  it("adds no extra newlines when the selection already starts and ends a line", () => {
    expect(applyMarks("a\nb\nc", 2, 3, fence).next).toBe("a\n```\nb\n```\nc");
  });

  it("wraps inline marks in place and reselects the wrapped text", () => {
    const result = applyMarks("make this bold", 5, 9, { before: "**", after: "**", placeholder: "bold text" });
    expect(result.next).toBe("make **this** bold");
    expect(result.next.slice(result.selectionStart, result.selectionEnd)).toBe("this");
  });
});
