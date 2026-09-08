/**
 * The one pagination contract every large, user-facing collection in this codebase
 * uses -- keyset (cursor) pagination, never offset/page-number, so a page is stable even
 * while new rows are being inserted concurrently. `nextCursor` is `null` once the caller
 * has reached the end of the collection -- absence of a cursor, not an empty-string
 * sentinel. See docs/decisions/0018-production-hardening-and-integration-boundary.md.
 */
export type Page<T> = {
  items: T[];
  nextCursor: string | null;
};
