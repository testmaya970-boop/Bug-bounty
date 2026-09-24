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
