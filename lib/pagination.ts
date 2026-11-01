/**
 * Opaque keyset cursor encoding: a `(timestamp, id)` pair, base64url-encoded so callers
 * treat it as an opaque token rather than a documented shape they could construct
 * themselves (a client cannot use this to skip to an arbitrary offset -- it only ever
 * decodes back to "the row after this specific one," which the query re-authorizes from
 * scratch on every call via the same RLS/RPC boundary the first page went through).
 */
export function encodeCursor(sortValue: string, id: string): string {
  return Buffer.from(`${sortValue}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { sortValue: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    // The id half (a uuid) never contains '|'; the sort-value half (a timestamptz) never
    // does either in practice, but splitting on the LAST '|' is what actually matters --
    // it is the id, not the sort value, whose simplicity this decoding depends on.
    const separatorIndex = decoded.lastIndexOf("|");
    if (separatorIndex <= 0) return null;
    const sortValue = decoded.slice(0, separatorIndex);
    const id = decoded.slice(separatorIndex + 1);
    // A forged id reached the query as a non-uuid and surfaced as a 500.
    if (!sortValue || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { sortValue, id };
  } catch {
    return null;
  }
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Clamp a caller-requested page size into a sane range -- never trust a client-supplied
 * limit large enough to defeat the point of pagination. */
export function clampPageSize(requested: number | undefined): number {
  // `requested === 0` must clamp to 1, not silently fall back to the default -- only
  // undefined/non-finite input means "nothing was requested."
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(requested), 1), MAX_PAGE_SIZE);
}
