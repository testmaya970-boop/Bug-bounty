// A small PDF 1.4 writer for executive reports: the 14 standard fonts (Helvetica, no
// embedding), text, filled rectangles and lines, A4 pages with automatic page breaks.
// ponytail: text widths use an average glyph width, not real font metrics; wrapping is
// approximate (slightly conservative). Swap in AFM widths if layouts ever need to be exact.

type Rgb = [number, number, number];
export const INK: Rgb = [0.09, 0.1, 0.12];
export const MUTED: Rgb = [0.42, 0.44, 0.48];
export const RULE: Rgb = [0.86, 0.87, 0.89];
export const ACCENT: Rgb = [0.84, 0.13, 0.13];

const PAGE_W = 595.28;
const PAGE_H = 841.89;
export const MARGIN = 48;
export const CONTENT_W = PAGE_W - MARGIN * 2;

/** WinAnsi-safe text: common punctuation mapped, anything else outside Latin-1 replaced. */
function pdfText(s: string): string {
  const mapped = s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  return mapped.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function textWidth(s: string, size: number, bold = false): number {
  return s.length * size * (bold ? 0.56 : 0.51);
}

export function wrap(s: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size, bold) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function truncate(s: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && textWidth(`${out}...`, size, bold) > maxWidth) out = out.slice(0, -1);
  return `${out}...`;
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const color = (c: Rgb, op: "rg" | "RG") => `${c.map(n).join(" ")} ${op}`;

export class PdfDocument {
  private pages: string[][] = [];
  /** Distance from the top of the page to the next free line (PDF y is bottom-up). */
  cursor = MARGIN;

  constructor(private footer: string) {
    this.addPage();
  }

  addPage() {
    this.pages.push([]);
    this.cursor = MARGIN;
  }

  private get ops() {
    return this.pages[this.pages.length - 1];
  }

  /** Starts a new page when the next block of `height` points would not fit. */
  ensure(height: number) {
    if (this.cursor + height > PAGE_H - MARGIN - 20) this.addPage();
  }

  text(x: number, top: number, s: string, size = 10, opts: { bold?: boolean; color?: Rgb; align?: "left" | "right" } = {}) {
    const width = textWidth(s, size, opts.bold);
    const left = opts.align === "right" ? x - width : x;
    this.ops.push(`BT /${opts.bold ? "F2" : "F1"} ${n(size)} Tf ${color(opts.color ?? INK, "rg")} ${n(left)} ${n(PAGE_H - top - size)} Td (${pdfText(s)}) Tj ET`);
  }

  rect(x: number, top: number, w: number, h: number, fill: Rgb) {
    this.ops.push(`${color(fill, "rg")} ${n(x)} ${n(PAGE_H - top - h)} ${n(w)} ${n(h)} re f`);
  }

  line(x1: number, top: number, x2: number, stroke: Rgb = RULE) {
    this.ops.push(`${color(stroke, "RG")} 0.6 w ${n(x1)} ${n(PAGE_H - top)} m ${n(x2)} ${n(PAGE_H - top)} l S`);
  }

  /** Flowing paragraph at the cursor. */
  paragraph(s: string, size = 10, opts: { bold?: boolean; color?: Rgb; gap?: number } = {}) {
    const lines = wrap(s, size, CONTENT_W, opts.bold);
    for (const l of lines) {
      this.ensure(size * 1.4);
      this.text(MARGIN, this.cursor, l, size, opts);
      this.cursor += size * 1.4;
    }
    this.cursor += opts.gap ?? 6;
  }

  heading(s: string) {
    this.ensure(48);
    this.cursor += 10;
    this.text(MARGIN, this.cursor, s, 13, { bold: true });
    this.cursor += 20;
    this.line(MARGIN, this.cursor, MARGIN + CONTENT_W);
    this.cursor += 10;
  }

  /** Columns with fixed widths; right-aligned columns for numbers. Header repeats on new pages. */
  table(columns: { label: string; width: number; align?: "left" | "right" }[], rows: string[][]) {
    const size = 8.5;
    const rowH = 15;
    const header = () => {
      let x = MARGIN;
      for (const c of columns) {
        this.text(c.align === "right" ? x + c.width - 4 : x, this.cursor, c.label, size, { bold: true, color: MUTED, align: c.align });
        x += c.width;
      }
      this.cursor += rowH;
      this.line(MARGIN, this.cursor - 4, MARGIN + CONTENT_W);
    };
    this.ensure(rowH * 3);
    header();
    for (const row of rows) {
      if (this.cursor + rowH > PAGE_H - MARGIN - 20) {
        this.addPage();
        header();
      }
      let x = MARGIN;
      row.forEach((cell, i) => {
        const c = columns[i];
        this.text(c.align === "right" ? x + c.width - 4 : x, this.cursor, truncate(cell, size, c.width - 8), size, { align: c.align });
        x += c.width;
      });
      this.cursor += rowH;
    }
    this.cursor += 8;
  }

  /** Horizontal bars, one per label, scaled to the largest value. */
  bars(items: { label: string; value: number; display: string; fill?: Rgb }[]) {
    const max = Math.max(1, ...items.map((i) => i.value));
    const labelW = 120;
    const barW = CONTENT_W - labelW - 60;
    for (const item of items) {
      this.ensure(18);
      this.text(MARGIN, this.cursor + 1, truncate(item.label, 9, labelW - 8), 9);
      this.rect(MARGIN + labelW, this.cursor + 1, Math.max(item.value > 0 ? 2 : 0, (item.value / max) * barW), 10, item.fill ?? ACCENT);
      this.text(MARGIN + labelW + barW + 52, this.cursor + 1, item.display, 9, { align: "right" });
      this.cursor += 17;
    }
    this.cursor += 6;
  }

  toBytes(): Uint8Array {
    const objects: string[] = [];
    const add = (body: string) => objects.push(body); // the new length is the 1-based object number
    add("<< /Type /Catalog /Pages 2 0 R >>");
    add(""); // pages, filled below
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds: number[] = [];
    this.pages.forEach((ops, i) => {
      const footer = [
        `${color(RULE, "RG")} 0.6 w ${n(MARGIN)} ${n(MARGIN)} m ${n(PAGE_W - MARGIN)} ${n(MARGIN)} l S`,
        `BT /F1 8 Tf ${color(MUTED, "rg")} ${n(MARGIN)} ${n(MARGIN - 14)} Td (${pdfText(this.footer)}) Tj ET`,
        `BT /F1 8 Tf ${color(MUTED, "rg")} ${n(PAGE_W - MARGIN - 50)} ${n(MARGIN - 14)} Td (${pdfText(`Page ${i + 1} of ${this.pages.length}`)}) Tj ET`,
      ];
      const stream = [...ops, ...footer].join("\n");
      const content = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
      pageIds.push(
        add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_W)} ${n(PAGE_H)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`),
      );
    });
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

    let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets: number[] = [];
    objects.forEach((body, i) => {
      offsets.push(Buffer.byteLength(out, "latin1"));
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });
    const xref = Buffer.byteLength(out, "latin1");
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
    out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return new Uint8Array(Buffer.from(out, "latin1"));
  }
}
