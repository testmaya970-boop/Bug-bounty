import { types as pgTypes, type Pool } from "pg";

/**
 * Every real type-parser correction this codebase needs on top of `pg`'s own defaults,
 * so that a row's runtime shape actually matches what every `services/*.ts` row-mapper
 * type declares. Named for what it does now (renamed from enum-array-type-parsers.ts,
 * which stopped being an accurate name the moment date/time parsing was added here too;
 * see registerDateTimeTypeParsers below) -- not a general "db setup" grab-bag, only type
 * parsers.
 *
 * Two independent corrections, deliberately split into two functions with two different
 * registration strategies:
 *
 * 1. registerDateTimeTypeParsers -- date/timestamp/timestamptz. Pure, synchronous,
 *    zero I/O: the three OIDs (1082/1114/1184) are Postgres built-ins, stable across
 *    every real Postgres install, never schema-dependent. Called unconditionally at
 *    THIS MODULE'S OWN LOAD TIME (see the call at the bottom of this file), not lazily
 *    from ensureEnumArrayTypeParsers -- so merely importing this module is enough to get
 *    correct date/time parsing, with no pool, no connection, and no possibility of an
 *    entry point importing the enum-array half without also getting this half. This is
 *    the fix for a real, previously-live bug (see that function's own comment) that
 *    stayed inert specifically because it was entangled with a DB round trip it never
 *    needed.
 *
 * 2. ensureEnumArrayTypeParsers -- enum/composite arrays. Necessarily async and
 *    pool-scoped: the OIDs it needs are dynamically assigned per-database at
 *    `create type`/`create table` time, so there is no fixed OID list to register
 *    up front -- discovering them requires one query against the specific database a
 *    specific pool is actually connected to. Kept in this same file (not split into a
 *    second module) since both are real "pg type parser" concerns and a caller needing
 *    one almost certainly needs the other; kept as two separate functions (not merged
 *    into one) since only one of them can run at import time.
 *
 * Every real process that opens a `pg.Pool` in this codebase imports this module as the
 * one place its pool gets constructed (see each call site's own comment for why it must
 * be there, not layered on afterward):
 *   - lib/db/pool.ts -- the Next.js app's own pool (server components, actions, route
 *     handlers, middleware all funnel through this one module).
 *   - workers/outbox/db-pool.ts -- the standalone outbox worker process (own Node.js
 *     process, own `pg` module instance, own type-parser registry -- process-global
 *     state never crosses process boundaries).
 *   - scripts/live-test-*.mjs -- ad-hoc live-integration scripts that previously
 *     constructed a bare `new Pool(...)` with NO parser registration of any kind (a real
 *     gap: confirmed via a full-repo grep for `new Pool(` -- these were the only two
 *     entry points not already covered). Each now imports registerDateTimeTypeParsers
 *     directly (they have no request-scoped/RLS-personalized pool wrapper of their own to
 *     hang ensureEnumArrayTypeParsers off, and none of them read an enum-array column
 *     today, so only the date/time half is wired there -- if a future script needs
 *     enum-array correctness too, it should call ensureEnumArrayTypeParsers(pool) the
 *     same way workers/outbox/db-pool.ts does).
 *   - The Vitest unit test harness never opens a real Pool at all (every service test
 *     mocks lib/db/pool.ts's withActorTransaction/callRpc at the module boundary -- see
 *     e.g. tests/unit/report-triage-service.test.ts's own header comment), so it is not a
 *     type-parser entry point and needed no change here.
 */

// ---------------------------------------------------------------------------
// 1. date / timestamp / timestamptz
// ---------------------------------------------------------------------------

// `pg` parses `date`/`timestamp`/`timestamptz` columns into JS Date objects by default,
// not the ISO strings every type in this codebase declares (Report.submittedAt,
// OrganizationAuditEventRecord.createdAt, ReportMessage.createdAt, ...all typed
// `string`). This went unnoticed for a long time because most call sites only ever pass
// these values through formatDateTime/formatDate (lib/format-date.ts), which happens to
// accept `string | Date` -- but any code that calls a string-only method on one (found
// live: services/timeline.ts's chronological sort called .localeCompare() on
// createdAt and crashed with "a.createdAt.localeCompare is not a function" the moment a
// real report had both an audit event and a message) breaks immediately. `date` columns
// have a second, worse failure mode confirmed live and fixed separately (lib/format-
// date.ts's toDateOnlyString): pg parses a `date` value at LOCAL midnight, so a bare
// template-literal coercion of it silently produces "Invalid Date", not a thrown error.
// Overriding these three parsers to return the real ISO string pg already computed
// internally (not a hand-rolled format) makes every existing `string`-typed field
// actually a string at runtime, matching what every type declaration in this codebase
// already assumes -- the correct fix belongs here, not at each of the many call sites
// that happen to read one of these columns.
const DATE_TIME_TYPE_OIDS = [1082, 1114, 1184]; // date, timestamp, timestamptz -- stable built-in Postgres OIDs, not schema-dependent, no discovery query needed.

let dateTimeParsersRegistered = false;

/** Idempotent and synchronous -- safe to call at module load time, safe to call more
 * than once (e.g. if more than one entry-point module imports this file), never needs a
 * Pool or a connection. `pg.types.setTypeParser` is process-global, so this only needs
 * to run once per process; the guard exists purely to avoid redundant repeated calls,
 * not to prevent a real correctness issue (calling setTypeParser twice with the same
 * function is harmless). */
export function registerDateTimeTypeParsers(): void {
  if (dateTimeParsersRegistered) return;
  for (const oid of DATE_TIME_TYPE_OIDS) {
    pgTypes.setTypeParser(oid, (value: string) => new Date(value).toISOString());
  }
  dateTimeParsersRegistered = true;
}

// Registered unconditionally at import time -- this is the entire point of the fix
// described above: an entry point that merely imports this module (even only for
// ensureEnumArrayTypeParsers below) gets correct date/time parsing with no further
// action required, and no entry point can accidentally skip it by, say, calling
// ensureEnumArrayTypeParsers lazily/conditionally.
registerDateTimeTypeParsers();

// ---------------------------------------------------------------------------
// 2. enum / composite arrays
// ---------------------------------------------------------------------------

/**
 * `pg` only auto-parses array types it has a built-in parser for (the fixed OIDs in
 * pg.types.builtins -- int4[], text[], uuid[], etc). A Postgres `enum[]` or composite-type
 * array column (e.g. `public.program_asset_type[]`, `public.researcher_focus_area[]`, or
 * an array of a table's own row type) gets a dynamically assigned OID at `create type`/
 * `create table` time that `pg` has never heard of, so it falls back to returning the raw,
 * unparsed array-literal text (e.g. `"{domain}"` as a JS string, not `["domain"]`) --
 * found live: every enum-array RPC result (list_public_programs's asset_types/
 * focus_areas, get_public_researcher_profile's hacking_interests/security_focus) crashed
 * every `.map()` call site downstream with "X.map is not a function" the instant a row
 * had a non-empty value.
 *
 * The fix is a one-time, schema-driven discovery, not a hardcoded OID list or a
 * hardcoded schema name: hardcoding would silently stop covering any enum/composite type
 * added by a future migration (in any schema, not just `public`), and OIDs are not even
 * guaranteed stable across a fresh database build (Postgres assigns them in creation
 * order) -- so the query below re-derives them from pg_catalog every time this process
 * starts, against whichever database it actually connects to, covering every
 * non-system-schema enum (`typtype = 'e'`) and composite (`typtype = 'c'`, which includes
 * every table's own automatic row type, not just a standalone `create type ... as (...)`)
 * that has an array form.
 *
 * Composite elements are left as pg's own raw `(a,b,c)`-style literal text, never
 * further parsed: `pg` itself never parses a *scalar* composite value either (confirmed
 * live -- `select row(1,2)::text` returns the literal string `"(1,2)"`, not an object),
 * since there is no universal, safe way to deserialize an arbitrary composite without
 * per-field type knowledge. This fix only closes the array-vs-string gap (so
 * `.map()`/`.length`/iteration work), matching pg's own existing stance on composites
 * exactly -- it does not invent composite deserialization pg itself doesn't offer.
 *
 * Shared by lib/db/pool.ts (the Next.js pool) and workers/outbox/db-pool.ts (the
 * standalone outbox worker's own, independent pool/process) -- each has its own `pg`
 * module-level type-parser registry (pg.types.setTypeParser is process-global, but these
 * are two separate Node.js processes with two separate `pg` module instances), so each
 * must call this once against its own pool. Memoized per pool instance (not globally) via
 * a WeakMap keyed on the Pool object, so calling this again with the same pool is a no-op
 * after the first successful run, while two independent pools (e.g. in tests, or if this
 * process ever created more than one) each get their own registration.
 */
const registeredPools = new WeakMap<Pool, Promise<void>>();

export async function ensureEnumArrayTypeParsers(pool: Pool): Promise<void> {
  let registration = registeredPools.get(pool);
  if (!registration) {
    registration = (async () => {
      const { rows } = await pool.query<{ array_oid: number }>(
        `select t.typarray as array_oid
         from pg_catalog.pg_type t
         join pg_catalog.pg_namespace n on n.oid = t.typnamespace
         where t.typtype in ('e', 'c')
           and t.typarray <> 0
           and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')`,
      );
      // pg.types.arrayParser.create is the identical internal parser pg's own built-in
      // array types use (e.g. _text/_int4) -- reused here rather than hand-rolling
      // array-literal parsing, so this gets pg's own escaping/quoting handling for free,
      // including for a composite element's own embedded parentheses/commas/quotes.
      // @types/pg's installed declaration for arrayParser (a plain 2-arg function) does
      // not match its actual runtime shape (an object with a .create(source, transform)
      // method returning { parse(): T[] } -- confirmed by reading
      // node_modules/pg-types/lib/arrayParser.js directly), so this cast works around a
      // stale third-party type declaration, not an actual `any`-typed value at runtime.
      const arrayParser = pgTypes.arrayParser as unknown as { create(source: string, transform: (value: string) => string): { parse(): string[] } };
      for (const { array_oid: arrayOid } of rows) {
        // The per-element transform is the identity function for both enum and composite
        // elements: an enum array's elements are already plain text (an enum label,
        // needing no further per-value conversion the way, say, `_int4`'s transform
        // parses each element as a number), and a composite array's elements are left as
        // pg's own raw literal text, matching pg's existing behavior for a scalar
        // composite exactly (see this file's own header comment).
        pgTypes.setTypeParser(arrayOid, (value: string) => arrayParser.create(value, (v) => v).parse());
      }
    })();
    registeredPools.set(pool, registration);
  }
  return registration;
}
