const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (value: string) => UUID_PATTERN.test(value);

/**
 * True when an org-scoped URL has a non-uuid where an id belongs:
 *   /organizations/[organizationId]/{programs,members,researchers}/[id]/reports/[reportId]
 * Such an id used to reach Postgres, fail the uuid cast, and surface as a 500 (found via
 * /platform/errors, even for signed-out visitors). proxy.ts checks this before anything
 * renders -- a layout can't: Next renders layouts and pages in parallel, so a layout's
 * notFound() still lets the page run its query. Static siblings (sign-up, reports/new) pass.
 */
export function hasMalformedIdSegment(pathname: string): boolean {
  const [root, orgId, section, childId, sub, grandchildId] = pathname.split("/").filter(Boolean);
  if (root !== "organizations" || orgId === undefined || orgId === "sign-up") return false;
  if (!isUuid(orgId)) return true;
  if ((section === "programs" || section === "members" || section === "researchers") && childId !== undefined && !isUuid(childId)) return true;
  if (section === "programs" && sub === "reports" && grandchildId !== undefined && grandchildId !== "new" && !isUuid(grandchildId)) return true;
  return false;
}
