import { describe, expect, it } from "vitest";
import { parseScopeFile } from "../../lib/scope-import-export";

describe("scope import: asset type / scope state normalization", () => {
  it("accepts a HackerOne-style CSV with uppercase asset types", () => {
    const csv = 'assetType,target,scopeState\n"URL","https://example.com","In Scope"\n"Domain","example.com",""';
    const results = parseScopeFile(csv, "csv");
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0]).toMatchObject({ ok: true, row: { assetType: "url", target: "https://example.com", scopeState: "in_scope" } });
    expect(results[1]).toMatchObject({ ok: true, row: { assetType: "domain", scopeState: "in_scope" } });
  });

  it("maps common other-platform vocabulary onto this app's asset types", () => {
    const csv = [
      "assetType,target",
      '"IP Address","10.0.0.0/24"',
      '"iOS","com.example.app"',
      '"Android","com.example.app"',
      '"Source Code","github.com/example/repo"',
      '"AI Model","gpt-classifier"',
    ].join("\n");
    const results = parseScopeFile(csv, "csv");
    expect(results.every((r) => r.ok)).toBe(true);
    const types = results.map((r) => (r.ok ? r.row.assetType : null));
    expect(types).toEqual(["ip_cidr", "ios_app", "android_app", "source_code", "ai_model"]);
  });

  it("still rejects a genuinely unrecognized asset type", () => {
    const csv = 'assetType,target\n"Spaceship","enterprise"';
    const results = parseScopeFile(csv, "csv");
    expect(results[0].ok).toBe(false);
    if (!results[0].ok) expect(results[0].error).toContain("Spaceship");
  });

  it("normalizes out-of-scope spelling variants", () => {
    const csv = 'assetType,target,scopeState\n"url","a.com","Out of Scope"\n"url","b.com","excluded"';
    const results = parseScopeFile(csv, "csv");
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.map((r) => (r.ok ? r.row.scopeState : null))).toEqual(["out_of_scope", "out_of_scope"]);
  });
});

// HackerOne's actual scope CSV export header -- the file a program owner downloads from
// their HackerOne scope page. The test above only uses this app's own column names.
const H1_HEADER = "identifier,asset_type,instruction,eligible_for_bounty,eligible_for_submission,availability_requirement,confidentiality_requirement,integrity_requirement,max_severity,system_tags,created_at,updated_at";
const h1Row = (identifier: string, assetType: string, instruction = "", eligibleForSubmission = "true") =>
  [identifier, assetType, instruction, "true", eligibleForSubmission, "", "", "", "critical", "", "2024-01-10T10:00:00Z", "2024-01-10T10:00:00Z"].join(",");

describe("scope import: HackerOne scope CSV export", () => {
  it("reads identifier / asset_type / instruction and maps every common HackerOne asset type", () => {
    const csv = [
      H1_HEADER,
      h1Row("*.acme.com", "WILDCARD", "All subdomains"),
      h1Row("203.0.113.0/24", "CIDR"),
      h1Row("123456789", "APPLE_STORE_APP_ID"),
      h1Row("com.acme.app", "GOOGLE_PLAY_APP_ID"),
      h1Row("https://github.com/acme/sdk", "SOURCE_CODE"),
      h1Row("Acme Router X1", "HARDWARE"),
    ].join("\n");
    const results = parseScopeFile(csv, "csv");
    expect(results.map((r) => (r.ok ? [r.row.assetType, r.row.target] : r.error))).toEqual([
      ["domain", "*.acme.com"],
      ["ip_cidr", "203.0.113.0/24"],
      ["ios_app", "123456789"],
      ["android_app", "com.acme.app"],
      ["source_code", "https://github.com/acme/sdk"],
      ["hardware", "Acme Router X1"],
    ]);
    expect(results[0]).toMatchObject({ row: { description: "All subdomains", scopeState: "in_scope" } });
  });

  it("resolves HackerOne URL assets by content: bare hostname -> domain, scheme-less path -> https URL, full URL -> url", () => {
    const csv = [H1_HEADER, h1Row("www.acme.com", "URL"), h1Row("acme.com/login", "URL"), h1Row("https://api.acme.com/v1", "URL")].join("\n");
    expect(parseScopeFile(csv, "csv").map((r) => (r.ok ? [r.row.assetType, r.row.target] : r.error))).toEqual([
      ["domain", "www.acme.com"],
      ["url", "https://acme.com/login"],
      ["url", "https://api.acme.com/v1"],
    ]);
  });

  it("maps eligible_for_submission=false to out of scope", () => {
    const results = parseScopeFile([H1_HEADER, h1Row("status.acme.com", "URL", "Third-party", "false")].join("\n"), "csv");
    expect(results[0]).toMatchObject({ ok: true, row: { scopeState: "out_of_scope" } });
  });

  it("keeps multi-line quoted instructions intact and reports the starting file line of each row", () => {
    const csv = [H1_HEADER, h1Row("*.acme.com", "WILDCARD", '"Line one,\nline two"'), h1Row("www.acme.com", "URL")].join("\n");
    const results = parseScopeFile(csv, "csv");
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ line: 2, ok: true, row: { description: "Line one,\nline two" } });
    expect(results[1]).toMatchObject({ line: 4, ok: true, row: { target: "www.acme.com" } });
  });

  it("ignores a UTF-8 byte-order mark before the header", () => {
    const results = parseScopeFile(`\uFEFF${H1_HEADER}\n${h1Row("*.acme.com", "WILDCARD")}`, "csv");
    expect(results[0]).toMatchObject({ ok: true, row: { target: "*.acme.com" } });
  });

  it("shortens an over-long instruction to the 500-character cap and says so, instead of rejecting the row", () => {
    const results = parseScopeFile([H1_HEADER, h1Row("*.acme.com", "WILDCARD", "x".repeat(1200))].join("\n"), "csv");
    const [first] = results;
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.row.description!.length).toBeLessThanOrEqual(500);
    expect(first.note).toBe("Instruction shortened from 1200 to 500 characters.");
  });

  it("skips a free-text OTHER asset with an explicit reason rather than guessing a type", () => {
    const results = parseScopeFile([H1_HEADER, h1Row("Any Acme-owned asset", "OTHER")].join("\n"), "csv");
    expect(results[0]).toMatchObject({ ok: false });
    expect(!results[0].ok && results[0].error).toMatch(/not a hostname or URL/);
  });

  it("accepts HackerOne field names in JSON too", () => {
    const results = parseScopeFile(JSON.stringify([{ identifier: "*.acme.com", asset_type: "WILDCARD", eligible_for_submission: false }]), "json");
    expect(results[0]).toMatchObject({ ok: true, row: { assetType: "domain", scopeState: "out_of_scope" } });
  });
});

describe("scope export: CSV formula injection", () => {
  it("neutralizes cells that a spreadsheet would run as a formula", async () => {
    const { serializeScopeEntries } = await import("../../lib/scope-import-export");
    const entry = { assetType: "domain", target: "api.acme.com", scopeState: "in_scope", description: '=HYPERLINK("https://evil.example","click")' };
    const csv = serializeScopeEntries([entry as never], "csv");
    const row = csv.split("\n")[1];
    expect(row).toContain(`"'=HYPERLINK(""https://evil.example"",""click"")"`);
    expect(row.startsWith("domain,api.acme.com,in_scope,")).toBe(true);
  });
});
