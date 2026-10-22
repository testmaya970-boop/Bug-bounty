import { describe, expect, it } from "vitest";
import { csvCell, csvRow } from "../../lib/csv";

describe("csv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises formula injection", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      expect(csvCell(evil).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell("plain")).toBe('"plain"');
    expect(csvCell("a=b")).toBe('"a=b"');
  });

  it("renders empty, numbers, dates and objects", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell(1500)).toBe('"1500"');
    expect(csvCell(-5)).toBe(`"'-5"`);
    expect(csvCell(new Date("2026-10-01T00:00:00Z"))).toBe('"2026-10-01T00:00:00.000Z"');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it("joins a row with CRLF", () => {
    expect(csvRow(["a", 1, null])).toBe('"a","1",""\r\n');
  });
});
