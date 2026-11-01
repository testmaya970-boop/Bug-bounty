import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetadataPair, RegistryList, SectionLabel } from "../../components/ui/security-primitives";

describe("SectionLabel: the one shared section label, not a hand-copied string per file", () => {
  it("renders its text as a quiet sentence-case label (Oct 22 rebuild: no uppercase)", () => {
    const html = renderToStaticMarkup(<SectionLabel>Evidence</SectionLabel>);
    expect(html).toContain("Evidence");
    expect(html).not.toContain("uppercase");
  });
});

describe("MetadataPair: label above value, never inline 'Label: value'", () => {
  it("renders both the label and the value", () => {
    const html = renderToStaticMarkup(<MetadataPair label="Severity" value="Critical" />);
    expect(html).toContain("Severity");
    expect(html).toContain("Critical");
  });

  it("renders the value in monospace only when explicitly asked", () => {
    const mono = renderToStaticMarkup(<MetadataPair label="Target" value="api.example.com" mono />);
    const plain = renderToStaticMarkup(<MetadataPair label="Researcher" value="Riley" />);
    expect(mono).toContain("font-mono");
    expect(plain).not.toContain("font-mono");
  });
});

describe("RegistryList: the shared bordered/divided list shell", () => {
  it("wraps children in a divided, bordered list", () => {
    const html = renderToStaticMarkup(
      <RegistryList>
        <li>Row one</li>
        <li>Row two</li>
      </RegistryList>,
    );
    expect(html).toContain("Row one");
    expect(html).toContain("Row two");
    expect(html).toContain("divide-y");
  });
});
