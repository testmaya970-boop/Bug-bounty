/** One quoted CSV cell. Cells starting with = + - @ (or tab/CR) get a leading quote so a
 * spreadsheet never evaluates them as a formula (CSV injection). */
export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : typeof value === "string" ? value : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** One CSV line (CRLF-terminated, RFC 4180). */
export function csvRow(values: unknown[]): string {
  return values.map(csvCell).join(",") + "\r\n";
}
