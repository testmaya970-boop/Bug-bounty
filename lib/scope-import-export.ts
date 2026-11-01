// Turn: bulk scope import/export (CSV/JSON/YAML). Deliberately client-safe (no
// "server-only") -- parsing/serialization both run in the browser: import previews the
// parsed rows before anything is sent to the server, and export builds the downloadable
// file client-side from data the page already fetched. No new server-side bulk RPC exists
// or is needed -- import replays the existing addScopeEntryAction once per row, so every
// imported entry gets the exact same validation/canonicalization/audit trail a manually
// added one does (see docs/decisions/0006-scope-asset-model.md).
//
// Shape, all three formats: one row/object per scope entry, four fields --
// assetType, target, scopeState (both optional on import, default in_scope), description
// (optional). CSV's header row uses these exact camelCase names so a round-tripped
// export->edit->import needs no field renaming. Import also accepts HackerOne's scope CSV
// export as-is (identifier / asset_type / instruction / eligible_for_submission) -- see
// FIELD_ALIASES and ASSET_TYPE_ALIASES.
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { ProgramAssetType, ScopeEntry, ScopeState } from "@/types/scope";

export type ScopeImportFormat = "csv" | "json" | "yaml";

export type ScopeImportRow = {
  assetType: ProgramAssetType;
  target: string;
  scopeState: ScopeState;
  description?: string;
};

export type ScopeImportRowResult =
  | { line: number; ok: true; row: ScopeImportRow; note?: string }
  | { line: number; ok: false; raw: unknown; error: string };

// program_scope_entries.description's own cap (202608260005).
const MAX_DESCRIPTION_LENGTH = 500;

const VALID_ASSET_TYPES: ProgramAssetType[] = ["domain", "url", "ip_cidr", "ios_app", "android_app", "source_code", "hardware", "ai_model"];
const VALID_SCOPE_STATES: ScopeState[] = ["in_scope", "out_of_scope"];

// Imported files come from other platforms (HackerOne, Bugcrowd exports) and from humans
// editing spreadsheets by hand -- neither reliably matches this app's own lowercase
// snake_case vocabulary. Normalize case/spacing first, then map the asset-type words other
// platforms actually use onto ours, before falling back to VALID_ASSET_TYPES' exact match.
const ASSET_TYPE_ALIASES: Record<string, ProgramAssetType> = {
  domain: "domain",
  wildcard: "domain",
  url: "url",
  uri: "url",
  website: "url",
  webapplication: "url",
  ip: "ip_cidr",
  ipaddress: "ip_cidr",
  cidr: "ip_cidr",
  ipcidr: "ip_cidr",
  ios: "ios_app",
  iosapp: "ios_app",
  iosapplication: "ios_app",
  apple: "ios_app",
  android: "android_app",
  androidapp: "android_app",
  androidapplication: "android_app",
  googleplay: "android_app",
  sourcecode: "source_code",
  source: "source_code",
  code: "source_code",
  github: "source_code",
  hardware: "hardware",
  device: "hardware",
  iot: "hardware",
  aimodel: "ai_model",
  ai: "ai_model",
  llm: "ai_model",
  model: "ai_model",
  // HackerOne's own asset_type values (its scope CSV export), compacted.
  applestoreappid: "ios_app",
  testflight: "ios_app",
  otheripa: "ios_app",
  googleplayappid: "android_app",
  otherapk: "android_app",
};

// Types whose target format depends on what the identifier actually is: HackerOne's "URL"
// is routinely a bare hostname (www.example.com), and "OTHER" is anything at all. Resolved
// per row from the target itself in resolveContentTypedAsset below.
const CONTENT_TYPED_ASSET_TYPES = new Set(["url", "uri", "website", "webapplication", "other"]);

const HOSTNAME_PATTERN = /^(\*\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?$/i;

function resolveContentTypedAsset(target: string): { assetType: ProgramAssetType; target: string } | null {
  if (/^https?:\/\//i.test(target)) return { assetType: "url", target };
  if (HOSTNAME_PATTERN.test(target)) return { assetType: "domain", target };
  // host/path with no scheme -- a URL missing its https://.
  const slash = target.indexOf("/");
  if (slash > 0 && HOSTNAME_PATTERN.test(target.slice(0, slash))) return { assetType: "url", target: `https://${target}` };
  return null;
}

function normalizeAssetType(raw: string): string {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if ((VALID_ASSET_TYPES as string[]).includes(lower)) return lower;
  const compact = lower.replace(/[\s_-]+/g, "");
  return ASSET_TYPE_ALIASES[compact] ?? lower;
}

function normalizeScopeState(raw: string): string {
  const lower = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (lower === "" || lower === "in" || lower === "instance") return "in_scope";
  if (lower === "out" || lower === "outofscope" || lower === "excluded" || lower === "exclude") return "out_of_scope";
  return lower;
}

/** Deliberately shallow -- presence/shape only (matches actions/scope.ts's own addSchema:
 * "Real validation and canonicalization is the database's job... never duplicated here").
 * A row that passes this still goes through private.canonicalize_scope_target for real
 * when addScopeEntryAction actually runs it -- an invalid CIDR, a malformed URL, or a
 * duplicate target all pass this preview and are only caught (and reported per-row) at
 * that point, in ImportScopeDialog's own outcomes screen. This function's job is only to
 * reject rows so structurally broken they'd be meaningless to even attempt (missing
 * target, unrecognized asset type/scope state, an over-length field) -- never to predict
 * whether the database will accept the target. */
// Column names accepted per field, compared after lowercasing and dropping non-alphanumerics
// (so assetType, asset_type, "Asset Type" all match). The first name in each list is this
// app's own export header; the rest are HackerOne's scope CSV columns.
const FIELD_ALIASES = {
  assetType: ["assettype", "type"],
  target: ["target", "identifier", "assetidentifier", "asset"],
  scopeState: ["scopestate", "scope"],
  description: ["description", "instruction", "instructions"],
  // HackerOne marks out-of-scope assets with eligible_for_submission=false.
  eligibleForSubmission: ["eligibleforsubmission"],
};

function readField(raw: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    if (aliases.includes(key.toLowerCase().replace(/[^a-z0-9]/g, ""))) return String(value).trim();
  }
  return undefined;
}

function parseBoolean(raw: string): boolean | null {
  const lower = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(lower)) return true;
  if (["false", "no", "n", "0"].includes(lower)) return false;
  return null;
}

function validateRow(raw: Record<string, unknown>, line: number): ScopeImportRowResult {
  const assetTypeInput = readField(raw, FIELD_ALIASES.assetType) ?? "";
  let target = readField(raw, FIELD_ALIASES.target) ?? "";
  const eligibleInput = readField(raw, FIELD_ALIASES.eligibleForSubmission);
  const eligible = eligibleInput ? parseBoolean(eligibleInput) : null;
  const scopeStateInput = readField(raw, FIELD_ALIASES.scopeState) || (eligible === false ? "out_of_scope" : "in_scope");
  const scopeStateRaw = normalizeScopeState(scopeStateInput);
  let description = readField(raw, FIELD_ALIASES.description) ?? "";

  if (target.length === 0) {
    return { line, ok: false, raw, error: `Row ${line}: target is required (a "target" or "identifier" column).` };
  }
  if (target.length > 2048) {
    return { line, ok: false, raw, error: `Row ${line}: target must be 2048 characters or fewer.` };
  }

  let assetType: string;
  const compactType = assetTypeInput.toLowerCase().replace(/[\s_-]+/g, "");
  if (CONTENT_TYPED_ASSET_TYPES.has(compactType)) {
    const resolved = resolveContentTypedAsset(target);
    if (!resolved) {
      return {
        line,
        ok: false,
        raw,
        error: `Row ${line}: "${target}" (${assetTypeInput}) is not a hostname or URL, and has no matching asset type here. Add it by hand with the closest type.`,
      };
    }
    assetType = resolved.assetType;
    target = resolved.target;
  } else {
    assetType = normalizeAssetType(assetTypeInput);
  }

  if (!VALID_ASSET_TYPES.includes(assetType as ProgramAssetType)) {
    return { line, ok: false, raw, error: `Row ${line}: "${assetTypeInput || "(empty)"}" is not a supported asset type (expected one of ${VALID_ASSET_TYPES.join(", ")}).` };
  }
  if (!VALID_SCOPE_STATES.includes(scopeStateRaw as ScopeState)) {
    return { line, ok: false, raw, error: `Row ${line}: "${scopeStateInput}" is not a valid scope state (expected in_scope or out_of_scope).` };
  }

  // Other platforms' instructions run long; the entry's description cap is 500. Shorten and
  // say so in the preview rather than rejecting an otherwise valid target.
  let note: string | undefined;
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    note = `Instruction shortened from ${description.length} to ${MAX_DESCRIPTION_LENGTH} characters.`;
    description = `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
  }

  return {
    line,
    ok: true,
    row: { assetType: assetType as ProgramAssetType, target, scopeState: scopeStateRaw as ScopeState, description: description || undefined },
    ...(note ? { note } : {}),
  };
}

/** RFC 4180-style CSV reader: double-quoted fields may contain commas, escaped "" quotes,
 * and line breaks (HackerOne's multi-line `instruction` column relies on that). Returns
 * each record with the 1-indexed file line it starts on, so errors point at the line a
 * user sees in a text editor. Blank records are dropped. */
function readCsvRecords(text: string): { line: number; fields: string[] }[] {
  const records: { line: number; fields: string[] }[] = [];
  let fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    fields.push(current);
    if (fields.some((field) => field.trim().length > 0)) records.push({ line: recordLine, fields });
    fields = [];
    current = "";
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        if (char === "\n") line++;
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      current += char;
    }
  }
  endRecord();
  return records;
}

function parseCsv(text: string): ScopeImportRowResult[] {
  // Excel and many exporters prefix a UTF-8 byte-order mark, which would otherwise glue
  // itself onto the first header name.
  const records = readCsvRecords(text.replace(/^﻿/, ""));
  if (records.length === 0) return [];
  const header = records[0].fields.map((h) => h.trim());
  return records.slice(1).map(({ line, fields }) => {
    const raw: Record<string, unknown> = {};
    header.forEach((key, index) => {
      raw[key] = fields[index] ?? "";
    });
    return validateRow(raw, line);
  });
}

function parseJson(text: string): ScopeImportRowResult[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return [{ line: 1, ok: false, raw: text, error: `Invalid JSON: ${error instanceof Error ? error.message : "could not parse file"}.` }];
  }
  if (!Array.isArray(data)) {
    return [{ line: 1, ok: false, raw: data, error: "Expected a JSON array of scope entries at the top level." }];
  }
  return data.map((row, index) => validateRow((row ?? {}) as Record<string, unknown>, index + 1));
}

function parseYamlRows(text: string): ScopeImportRowResult[] {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch (error) {
    return [{ line: 1, ok: false, raw: text, error: `Invalid YAML: ${error instanceof Error ? error.message : "could not parse file"}.` }];
  }
  if (!Array.isArray(data)) {
    return [{ line: 1, ok: false, raw: data, error: "Expected a YAML list of scope entries at the top level." }];
  }
  return data.map((row, index) => validateRow((row ?? {}) as Record<string, unknown>, index + 1));
}

export function parseScopeFile(text: string, format: ScopeImportFormat): ScopeImportRowResult[] {
  if (format === "csv") return parseCsv(text);
  text = text.replace(/^﻿/, "");
  if (format === "json") return parseJson(text);
  return parseYamlRows(text);
}

/** Detects format from filename extension -- the one piece of client-side "smart" behavior
 * this module has; everything else is explicit. Falls back to null (caller must ask) for
 * an unrecognized extension rather than guessing from content. */
export function detectFormatFromFilename(filename: string): ScopeImportFormat | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return "yaml";
  return null;
}

function csvEscape(value: string): string {
  // Formula injection: a cell starting with = + - @ (or tab/CR) runs as a formula when the
  // export is opened in Excel/Sheets -- and scope text can now come from imported
  // third-party files. The standard neutralizer (OWASP) is a leading apostrophe.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/** Exports active scope entries in the given format -- `target` (the raw canonical form),
 * never `displayTarget`, so a re-imported file round-trips through canonicalize_scope_target
 * unchanged rather than potentially drifting from a display-only rendering. */
export function serializeScopeEntries(entries: ScopeEntry[], format: ScopeImportFormat): string {
  const rows: ScopeImportRow[] = entries.map((entry) => ({
    assetType: entry.assetType,
    target: entry.target,
    scopeState: entry.scopeState,
    description: entry.description ?? undefined,
  }));

  if (format === "json") return JSON.stringify(rows, null, 2);
  if (format === "yaml") return stringifyYaml(rows);

  const header = ["assetType", "target", "scopeState", "description"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([row.assetType, row.target, row.scopeState, row.description ?? ""].map((value) => csvEscape(String(value))).join(","));
  }
  return lines.join("\n");
}

export function scopeFileMimeType(format: ScopeImportFormat): string {
  if (format === "json") return "application/json";
  if (format === "yaml") return "application/yaml";
  return "text/csv";
}
