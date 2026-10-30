import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "../../components/ui/markdown";
import { applyMarks, formatSelection, highlightMarkdown } from "../../components/ui/markdown-textarea";

describe("Markdown editor live formatting: highlightMarkdown", () => {
  const html = (value: string) => renderToStaticMarkup(<>{highlightMarkdown(value)}</>);
  const text = (value: string) => html(value).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

  it("shows bold, code and links styled while keeping every character in place", () => {
    const value = "a **bold** `x` [t](https://e.x) _it_";
    expect(html(value)).toContain('<strong class="font-bold">');
    expect(html(value)).toContain("<code");
    expect(html(value)).toContain("<em>");
    expect(text(value)).toBe(value);
  });

  it("keeps typed HTML as inert text", () => {
    const out = html('<img src=x onerror="alert(1)"><script>alert(1)</script>');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;script&gt;");
  });

  it("leaves snake_case alone and styles fenced blocks", () => {
    expect(html("user_id_value")).not.toContain("<em>");
    const fenced = "```\ncode\n```";
    expect(text(fenced)).toBe(fenced);
    expect(html(fenced)).toContain('class="bg-ink/10"');
  });
});

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

describe("Markdown editor shortcuts: formatSelection", () => {
  const bold = { before: "**", after: "**", placeholder: "bold text" };
  const apply = (value: string, edit: ReturnType<typeof formatSelection>) => value.slice(0, edit.from) + edit.text + value.slice(edit.to);

  it("Ctrl+B wraps the selection, and a second press unwraps it", () => {
    const value = "make this bold";
    const first = formatSelection(value, 5, 9, bold);
    const wrapped = apply(value, first);
    expect(wrapped).toBe("make **this** bold");
    const second = formatSelection(wrapped, first.selectionStart, first.selectionEnd, bold);
    expect(apply(wrapped, second)).toBe(value);
    expect(value.slice(second.selectionStart, second.selectionEnd)).toBe("this");
  });

  it("unwraps when the selection includes the marks", () => {
    const value = "make **this** bold";
    expect(apply(value, formatSelection(value, 5, 13, bold))).toBe("make this bold");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const edit = formatSelection("ab", 1, 1, bold);
    expect(apply("ab", edit)).toBe("a**bold text**b");
  });
});
