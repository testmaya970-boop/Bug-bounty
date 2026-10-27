/**
 * Which files may be attached to a report, and how each is recognised. Shared: the browser
 * uses it to filter the picker and explain a refusal before anything uploads; the server uses
 * the same table to decide (services/evidence-uploads.ts), checking the extension, then the
 * first bytes of the stored object against the type's file signature. The type a file is
 * stored and served as comes from this table, never from the browser's claim, and every
 * download is forced to application/octet-stream as an attachment (lib/evidence-store.ts), so
 * nothing uploaded can render or execute in the app.
 *
 * Archives and executables are deliberately absent: a proof of concept that needs one should
 * be described in text and shared on request.
 */
export type EvidenceKind = "image" | "video" | "document" | "text";

type EvidenceType = { mime: string; kind: EvidenceKind; label: string; signature: (head: Uint8Array) => boolean };

const startsWith = (head: Uint8Array, bytes: number[], offset = 0) => bytes.every((b, i) => head[offset + i] === b);
const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** Plain text: valid UTF-8 (BOM allowed) with no NUL bytes in the sampled head. */
export function looksLikeText(head: Uint8Array): boolean {
  if (head.length === 0) return false;
  if (head.includes(0)) return false;
  try {
    // A multi-byte character cut off at the end of the sample is not an error.
    new TextDecoder("utf-8", { fatal: true }).decode(head.subarray(0, trimToCharBoundary(head)));
    return true;
  } catch {
    return false;
  }
}
function trimToCharBoundary(head: Uint8Array): number {
  let end = head.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const b = head[end - i];
    if ((b & 0xc0) === 0x80) continue;
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return end;
}
const looksLikeJson = (head: Uint8Array) => {
  if (!looksLikeText(head)) return false;
  const first = new TextDecoder().decode(head).replace(/^﻿/, "").trimStart()[0];
  return first === "{" || first === "[";
};

export const EVIDENCE_TYPES: Record<string, EvidenceType> = {
  png: { mime: "image/png", kind: "image", label: "PNG", signature: (h) => startsWith(h, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  jpg: { mime: "image/jpeg", kind: "image", label: "JPG", signature: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  jpeg: { mime: "image/jpeg", kind: "image", label: "JPEG", signature: (h) => startsWith(h, [0xff, 0xd8, 0xff]) },
  webp: { mime: "image/webp", kind: "image", label: "WebP", signature: (h) => startsWith(h, ascii("RIFF")) && startsWith(h, ascii("WEBP"), 8) },
  mp4: { mime: "video/mp4", kind: "video", label: "MP4", signature: (h) => startsWith(h, ascii("ftyp"), 4) },
  webm: { mime: "video/webm", kind: "video", label: "WebM", signature: (h) => startsWith(h, [0x1a, 0x45, 0xdf, 0xa3]) },
  pdf: { mime: "application/pdf", kind: "document", label: "PDF", signature: (h) => startsWith(h, ascii("%PDF-")) },
  txt: { mime: "text/plain", kind: "text", label: "TXT", signature: looksLikeText },
  log: { mime: "text/plain", kind: "text", label: "LOG", signature: looksLikeText },
  csv: { mime: "text/csv", kind: "text", label: "CSV", signature: looksLikeText },
  json: { mime: "application/json", kind: "text", label: "JSON", signature: looksLikeJson },
  // HTTP Archive: the browser's own export of a captured request/response session (JSON).
  har: { mime: "application/json", kind: "text", label: "HAR", signature: looksLikeJson },
};

/** For the file input's accept attribute. */
export const EVIDENCE_ACCEPT = Object.keys(EVIDENCE_TYPES).map((ext) => `.${ext}`).join(",");

/** "PNG, JPG, WebP, MP4, WebM, PDF, TXT, LOG, CSV, JSON, HAR" */
export const EVIDENCE_FORMATS_LABEL = [...new Set(Object.values(EVIDENCE_TYPES).map((t) => t.label))].filter((label) => label !== "JPEG").join(", ");

export function evidenceExtension(filename: string): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename.trim());
  return match ? match[1].toLowerCase() : null;
}

export function evidenceTypeFor(filename: string): (EvidenceType & { ext: string }) | null {
  const ext = evidenceExtension(filename);
  return ext && EVIDENCE_TYPES[ext] ? { ...EVIDENCE_TYPES[ext], ext } : null;
}

export type EvidenceLimits = { maxFileBytes: number; maxFiles: number };

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** The checks that can be made from a file's name and size alone (the server repeats them). */
export function evidenceFileProblem(file: { name: string; size: number }, limits: EvidenceLimits): string | null {
  const name = file.name.trim();
  if (!name) return "The file has no name.";
  if (name.length > 255) return "File name must be 255 characters or fewer.";
  if (!evidenceTypeFor(name)) return `${name}: this file type isn't accepted. Use ${EVIDENCE_FORMATS_LABEL}.`;
  if (file.size === 0) return `${name} is empty.`;
  if (file.size > limits.maxFileBytes) return `${name} is ${formatBytes(file.size)}. Files must be ${formatBytes(limits.maxFileBytes)} or smaller.`;
  return null;
}

/** "Up to 20 files, 50 MB each. PNG, JPG, ..." */
export function describeEvidenceLimits(limits: EvidenceLimits): string {
  return `Up to ${limits.maxFiles} files, ${formatBytes(limits.maxFileBytes)} each: ${EVIDENCE_FORMATS_LABEL}.`;
}
