import { describe, expect, it } from "vitest";
import { externalProfileUrl, normalizeExternalHandle } from "../../lib/external-profiles";
import { EVIDENCE_TYPES, evidenceFileProblem, evidenceTypeFor, looksLikeText } from "../../lib/evidence-policy";
import { scoreCvssVector } from "../../lib/cvss-vector";
import { effectivePriority, payoutTierForPriority, priorityForSeverity, priorityLabel } from "../../lib/report-priority";
import { entryNeedsSpecificTarget } from "../../components/reports/scope-target-picker";
import { SEVERITY_LABEL, severityLabel } from "../../lib/report-status";
import { weaknessTypeLabel, WEAKNESS_TYPE_ORDER } from "../../lib/report-weakness-labels";

describe("external profiles: one stored handle, links always rebuilt from the platform", () => {
  it("accepts a bare handle, @handle, or the platform's own profile URL", () => {
    expect(normalizeExternalHandle("hackerone", "jordan_h1")).toEqual({ ok: true, handle: "jordan_h1" });
    expect(normalizeExternalHandle("hackerone", "@jordan_h1")).toEqual({ ok: true, handle: "jordan_h1" });
    expect(normalizeExternalHandle("hackerone", "https://hackerone.com/jordan_h1?type=user")).toEqual({ ok: true, handle: "jordan_h1" });
    expect(normalizeExternalHandle("hackerone", "hackerone.com/jordan_h1/")).toEqual({ ok: true, handle: "jordan_h1" });
    expect(normalizeExternalHandle("x", "https://twitter.com/jordan")).toEqual({ ok: true, handle: "jordan" });
    expect(normalizeExternalHandle("hackthebox", "https://app.hackthebox.com/users/12345")).toEqual({ ok: true, handle: "12345" });
  });

  it("clears with an empty value, and refuses other hosts, other schemes and malformed handles", () => {
    expect(normalizeExternalHandle("github", "  ")).toEqual({ ok: true, handle: null });
    expect(normalizeExternalHandle("hackerone", "https://evil.example/jordan").ok).toBe(false);
    expect(normalizeExternalHandle("hackerone", "javascript:alert(1)").ok).toBe(false);
    expect(normalizeExternalHandle("github", "-leading-dash").ok).toBe(false);
    expect(normalizeExternalHandle("github", "double--dash").ok).toBe(false);
    expect(normalizeExternalHandle("x", "this_handle_is_too_long").ok).toBe(false);
    expect(normalizeExternalHandle("hackerone", "%E0%A4%A").ok).toBe(false); // malformed percent-encoding
  });

  it("builds the link only from the platform's base URL", () => {
    expect(externalProfileUrl("hackerone", "jordan_h1")).toBe("https://hackerone.com/jordan_h1");
    expect(externalProfileUrl("github", null)).toBeNull();
  });
});

describe("attachments: type by extension, verified by file signature", () => {
  const limits = { maxFileBytes: 50 * 1024 * 1024, maxFiles: 20 };
  const bytes = (...b: number[]) => new Uint8Array(b);
  const ascii = (s: string) => new TextEncoder().encode(s);

  it("accepts the supported formats and refuses executables, archives, oversize and empty files", () => {
    expect(evidenceFileProblem({ name: "poc.mp4", size: 1024 }, limits)).toBeNull();
    expect(evidenceFileProblem({ name: "notes.TXT", size: 10 }, limits)).toBeNull();
    expect(evidenceFileProblem({ name: "payload.exe", size: 10 }, limits)).toMatch(/isn't accepted/);
    expect(evidenceFileProblem({ name: "poc.zip", size: 10 }, limits)).toMatch(/isn't accepted/);
    expect(evidenceFileProblem({ name: "page.html", size: 10 }, limits)).toMatch(/isn't accepted/);
    expect(evidenceFileProblem({ name: "big.png", size: limits.maxFileBytes + 1 }, limits)).toMatch(/50 MB or smaller/);
    expect(evidenceFileProblem({ name: "empty.pdf", size: 0 }, limits)).toMatch(/empty/);
  });

  it("matches real file signatures and rejects a renamed file", () => {
    expect(EVIDENCE_TYPES.png.signature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true);
    expect(EVIDENCE_TYPES.png.signature(ascii("<html><script>"))).toBe(false);
    expect(EVIDENCE_TYPES.jpg.signature(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(EVIDENCE_TYPES.pdf.signature(ascii("%PDF-1.7"))).toBe(true);
    expect(EVIDENCE_TYPES.pdf.signature(bytes(0x4d, 0x5a, 0x90, 0x00))).toBe(false); // "MZ": a Windows executable
    expect(EVIDENCE_TYPES.webp.signature(ascii("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe(true);
    expect(EVIDENCE_TYPES.mp4.signature(bytes(0, 0, 0, 0x20, ...ascii("ftypisom")))).toBe(true);
    expect(EVIDENCE_TYPES.webm.signature(bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
    expect(EVIDENCE_TYPES.json.signature(ascii('  {"log": {}}'))).toBe(true);
    expect(EVIDENCE_TYPES.json.signature(ascii("not json"))).toBe(false);
  });

  it("text means UTF-8 without NUL bytes; a character cut off at the end of the sample is fine", () => {
    expect(looksLikeText(ascii("GET / HTTP/1.1\r\nHost: x"))).toBe(true);
    expect(looksLikeText(bytes(0x48, 0x00, 0x49))).toBe(false);
    expect(looksLikeText(bytes(0x61, 0xe2, 0x82))).toBe(true); // "a" + the first two bytes of "€"
    expect(looksLikeText(bytes(0xff, 0xfe, 0x00))).toBe(false);
  });

  it("stores the type from its own table, never the browser's claim", () => {
    expect(evidenceTypeFor("Screen Recording.MP4")?.mime).toBe("video/mp4");
    expect(evidenceTypeFor("capture.har")?.mime).toBe("application/json");
  });
});

describe("CVSS: scored from the vector, 4.0 or 3.1", () => {
  it("scores valid base vectors", () => {
    expect(scoreCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toMatchObject({ ok: true, version: "3.1", score: 9.8, severity: "critical" });
    const v4 = scoreCvssVector("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N");
    expect(v4).toMatchObject({ ok: true, version: "4.0", severity: "critical" });
    expect(v4.ok && v4.score).toBe(9.3);
  });

  it("refuses incomplete, misordered, unknown-version and environmental vectors with a useful message", () => {
    expect(scoreCvssVector("CVSS:4.0/AV:N/AC:L").ok).toBe(false);
    expect(scoreCvssVector("CVSS:3.1/AC:L/AV:N/PR:N/UI:N/S:U/C:H/I:H/A:H").ok).toBe(false);
    expect(scoreCvssVector("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toMatchObject({ ok: false, message: expect.stringMatching(/CVSS:4\.0\/ or CVSS:3\.1\//) });
    expect(scoreCvssVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/E:P").ok).toBe(false);
  });
});

describe("priority (P0-P4) is separate from severity, and only defaults from it", () => {
  it("maps severity to its default priority and each priority to exactly one payout tier", () => {
    expect(priorityForSeverity("critical")).toBe("p0");
    expect(priorityForSeverity("none")).toBe("p4");
    expect(payoutTierForPriority("p0")).toBe("critical");
    expect(payoutTierForPriority("p4")).toBe("none");
    expect(priorityLabel("p4")).toBe("P4 · Informational");
  });

  it("an explicit priority wins over the severity default; neither means none", () => {
    expect(effectivePriority({ priority: null, confirmedSeverity: "high" })).toBe("p1");
    expect(effectivePriority({ priority: "p0", confirmedSeverity: "low" })).toBe("p0");
    expect(effectivePriority({ priority: null, confirmedSeverity: null })).toBeNull();
  });
});

describe("severity and category labels", () => {
  it("the stored value none reads Info everywhere", () => {
    expect(severityLabel("none")).toBe("Info");
    expect(SEVERITY_LABEL.none).toBe("Info");
  });

  it("the category taxonomy includes the classes programs triage most", () => {
    expect(WEAKNESS_TYPE_ORDER).toContain("insecure_file_upload");
    expect(WEAKNESS_TYPE_ORDER).toContain("api_security");
    expect(WEAKNESS_TYPE_ORDER.at(-1)).toBe("other");
    expect(weaknessTypeLabel("idor")).toBe("Insecure Direct Object Reference (IDOR)");
  });
});

describe("scope picker: which assets need a specific target", () => {
  const entry = (assetType: "domain" | "ip_cidr" | "url" | "ios_app", target: string) => ({ id: "e", assetType, target, displayTarget: target });
  it("wildcards, ranges and URL prefixes need one; exact hosts, single IPs and apps don't", () => {
    expect(entryNeedsSpecificTarget(entry("domain", "*.example.com"))).toBe(true);
    expect(entryNeedsSpecificTarget(entry("domain", "api.example.com"))).toBe(false);
    expect(entryNeedsSpecificTarget(entry("ip_cidr", "203.0.113.0/24"))).toBe(true);
    expect(entryNeedsSpecificTarget(entry("ip_cidr", "203.0.113.5/32"))).toBe(false);
    expect(entryNeedsSpecificTarget(entry("url", "https://example.com/admin"))).toBe(true);
    expect(entryNeedsSpecificTarget(entry("ios_app", "https://apps.apple.com/app/id1"))).toBe(false);
  });
});
