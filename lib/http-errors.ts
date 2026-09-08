/**
 * The one CODE -> HTTP status mapping table, used by API routes only (Server Actions
 * have no HTTP status of their own -- they already return a stable `{ ok, code, message }`
 * shape, which is this same contract's Server-Action-shaped equivalent). Every code here
 * was pulled from an actual `raise exception 'CODE: message'` already present somewhere
 * in supabase/migrations/ or an existing services/*.ts error mapper -- this is not a
 * speculative, invented taxonomy. An unmapped code defaults to 500, which is exactly
 * this codebase's existing behavior for anything not deliberately classified (see
 * services/rpc-error.ts's own "unrecognized error -> UNKNOWN" fallback) -- never a
 * regression from adding this map, only ever an improvement for the codes it does cover.
 * Expanding this table as new codes are introduced is a mechanical, low-risk follow-up.
 */
const CODE_TO_HTTP_STATUS: Record<string, number> = {
  // 401 -- no valid session, or credentials were flatly wrong.
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  EMAIL_NOT_CONFIRMED: 401,

  // 403 -- authenticated, but not permitted to act on this object.
  FORBIDDEN: 403,
  LAST_OWNER: 403,
  SEVERITY_LOCKED: 403,
  KYC_REQUIRED: 403,

  // 404 -- the referenced object does not exist, or (deliberately, per SECURITY.md)
  // exists but the caller is not authorized to know that -- the two are indistinguishable
  // by design everywhere in this codebase.
  PROGRAM_NOT_FOUND: 404,
  REPORT_NOT_FOUND: 404,
  ORGANIZATION_NOT_FOUND: 404,
  NOTIFICATION_NOT_FOUND: 404,
  DELIVERY_NOT_FOUND: 404,
  RESEARCHER_NOT_FOUND: 404,
  MEDIATION_NOT_FOUND: 404,
  RETEST_NOT_FOUND: 404,

  // 409 -- the request is well-formed, but conflicts with the object's current state.
  SLUG_GENERATION_FAILED: 409,
  BOUNTY_ALREADY_FINALIZED: 409,
  PROVENANCE_MISMATCH: 409,
  INVALID_PROGRAM_TRANSITION: 409,
  MEDIATION_ALREADY_OPEN: 409,
  MEDIATION_ALREADY_DECIDED: 409,
  MEDIATION_ALREADY_ESCALATED: 409,
  MEDIATION_NOT_OPEN: 409,
  MEDIATION_NOT_ESCALATED: 409,
  RETEST_ALREADY_PENDING: 409,
  RETEST_ALREADY_ESCALATED: 409,
  RETEST_NOT_REQUESTED: 409,
  RETEST_NOT_ESCALATED: 409,

  // 422 -- the request is well-formed JSON/params but fails a domain validation rule.
  INVALID_INPUT: 422,
  INVALID_TITLE: 422,
  INVALID_DESCRIPTION: 422,
  INVALID_NAME: 422,
  INVALID_EMAIL: 422,
  WEAK_PASSWORD: 422,
  EMAIL_TAKEN: 422,
  TARGET_NOT_ELIGIBLE: 422,
  SUBMISSIONS_CLOSED: 422,
  CATEGORY_NOT_CONFIGURABLE: 422,
  INVALID_NOTIFICATION_TYPE: 422,
  INVALID_FACT_TYPE: 422,
  INVALID_MEDIATION_REQUEST: 422,
  INVALID_MEDIATION_OUTCOME: 422,
  INVALID_RETEST_OUTCOME: 422,
  REPORT_NOT_TERMINAL: 422,
  REPORT_NOT_RESOLVED: 422,
  INVALID_ACCOUNT_HOLDER: 422,
  INVALID_ACCOUNT_NUMBER: 422,
  INVALID_ROUTING: 422,
  INVALID_PAYPAL_EMAIL: 422,
  INVALID_METHOD: 422,
  INVALID_THRESHOLD: 422,
  INVALID_TAX_ID: 422,

  // 429 -- the actual rate-limit boundary this slice introduced.
  RATE_LIMITED: 429,
};

/** Anything not explicitly classified above is a 500 -- the same safe default this
 * codebase's OrganizationServiceError("...", "UNKNOWN") already falls back to. */
export function httpStatusForErrorCode(code: string): number {
  return CODE_TO_HTTP_STATUS[code] ?? 500;
}
