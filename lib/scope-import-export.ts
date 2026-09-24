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
// export->edit->import needs no field renaming.
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
  | { line: number; ok: true; row: ScopeImportRow }
  | { line: number; ok: false; raw: unknown; error: string };

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
  other: "url",
};

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
function validateRow(raw: Record<string, unknown>, line: number): ScopeImportRowResult {
  const assetTypeInput = String(raw.assetType ?? raw.asset_type ?? "").trim();
  const assetTypeRaw = normalizeAssetType(assetTypeInput);
  const target = String(raw.target ?? "").trim();
  const scopeStateInput = String(raw.scopeState ?? raw.scope_state ?? "in_scope").trim();
  const scopeStateRaw = normalizeScopeState(scopeStateInput);
  const descriptionRaw = raw.description != null ? String(raw.description).trim() : "";

  if (!VALID_ASSET_TYPES.includes(assetTypeRaw as ProgramAssetType)) {
    return { line, ok: false, raw, error: `Row ${line}: "${assetTypeInput || "(empty)"}" is not a valid asset type (expected one of ${VALID_ASSET_TYPES.join(", ")}).` };
  }
  if (target.length === 0) {
    return { line, ok: false, raw, error: `Row ${line}: target is required.` };
  }
  if (target.length > 2048) {
    return { line, ok: false, raw, error: `Row ${line}: target must be 2048 characters or fewer.` };
  }
  if (!VALID_SCOPE_STATES.includes(scopeStateRaw as ScopeState)) {
    return { line, ok: false, raw, error: `Row ${line}: "${scopeStateInput}" is not a valid scope state (expected in_scope or out_of_scope).` };
  }
  if (descriptionRaw.length > 500) {
    return { line, ok: false, raw, error: `Row ${line}: description must be 500 characters or fewer.` };
  }

  return {
    line,
    ok: true,
    row: { assetType: assetTypeRaw as ProgramAssetType, target, scopeState: scopeStateRaw as ScopeState, description: descriptionRaw || undefined },
  };
}

/** A minimal, deliberately strict CSV line-splitter -- handles double-quoted fields
 * (including an escaped "" inside a quoted field) since a target or description can
 * legitimately contain a comma, but nothing fancier (no embedded newlines inside a quoted
 * field). Real-world exported scope lists are simple flat rows; a spreadsheet-grade CSV
 * parser is not needed for that shape, and not adding one avoids a second, larger
 * dependency for a feature that already has one (yaml) for a genuinely irregular format. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text: string): ScopeImportRowResult[] {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const results: ScopeImportRowResult[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const raw: Record<string, unknown> = {};
    header.forEach((key, index) => {
      raw[key] = values[index] ?? "";
    });
    // +1 for the header row, +1 for 1-indexing -- line numbers here match what a user
    // would see opening the file in a spreadsheet or text editor.
    results.push(validateRow(raw, i + 1));
  }
  return results;
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
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
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
