// What changed, in words, from an audit row's metadata: every previous_X / new_X pair becomes
// "X: before → after", and a few self-describing fields (target, email, role, reason...) are
// listed as they are. Ids and internal bookkeeping are left out -- the row already links them.

const SHOWN = ["summary", "target", "asset_type", "scope_state", "email", "role", "title", "name", "reason", "note", "visibility", "status", "tier", "number", "kind"];
const HIDDEN = /(^|_)(id|ids|idempotency_key|hash|token)$|^program_status$/;

const words = (key: string) => key.replace(/_minor_units$/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function value(key: string, v: unknown, metadata: Record<string, unknown>): string {
  if (v === null || v === undefined || v === "") return "none";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number" && key.endsWith("_minor_units")) return `${typeof metadata.currency === "string" ? `${metadata.currency} ` : ""}${(v / 100).toFixed(2)}`;
  if (typeof v === "string") return v.replace(/_/g, " ");
  if (Array.isArray(v)) return v.map((x) => String(x).replace(/_/g, " ")).join(", ") || "none";
  return JSON.stringify(v);
}

export function describeAuditChange(metadata: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const used = new Set<string>();
  for (const key of Object.keys(metadata)) {
    const m = /^(previous|old)_(.+)$/.exec(key);
    if (!m) continue;
    const field = m[2];
    const after = `new_${field}` in metadata ? `new_${field}` : null;
    if (!after || HIDDEN.test(field)) continue;
    used.add(key).add(after);
    const before = value(field, metadata[key], metadata);
    const now = value(field, metadata[after], metadata);
    lines.push(before === now ? `${words(field)}: ${now} (unchanged)` : `${words(field)}: ${before} → ${now}`);
  }
  for (const key of SHOWN) {
    if (key in metadata && !used.has(key) && metadata[key] !== null && metadata[key] !== "") lines.push(key === "summary" ? String(metadata[key]) : `${words(key)}: ${value(key, metadata[key], metadata)}`);
  }
  if (typeof metadata.amount_minor_units === "number" && !used.has("amount_minor_units")) lines.push(`Amount: ${value("amount_minor_units", metadata.amount_minor_units, metadata)}`);
  // Drop "unchanged" lines when something did change, so the real edit leads.
  const changed = lines.filter((l) => !l.endsWith("(unchanged)"));
  return changed.length ? changed : lines;
}
