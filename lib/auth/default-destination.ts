import "server-only";
import type { Route } from "next";
import { listCurrentUserOrganizations } from "@/services/organizations";
import { listMyProgramParticipations } from "@/services/program-researchers";
import { isPlatformAdmin } from "@/services/platform-operations";

/**
 * Real, server-derived context, never a guessed role -- checked in order: platform-admin
 * status first (a real platform_admins row lands on /platform/programs, the launch-review
 * queue, never the researcher dashboard a platform admin has no real reputation/reports
 * behind -- confirmed live as a genuine gap: a platform-admin-only test account landed on
 * "You haven't submitted any reports yet" with nothing admin-shaped about it), then org-only
 * (-> /organizations), then everyone else (researcher-only, both, or neither yet) on "/",
 * the real researcher dashboard (reputation, ledger, my reports, recommended programs) --
 * matching the HackerOne/Bugcrowd model of "sign-in takes you to your own dashboard, not
 * the public program directory." /programs remains reachable as its own page (and
 * correctly serves both anonymous visitors browsing public programs and a signed-in
 * researcher's own "My programs"/"Invitations" tabs) -- it is simply no longer the sign-in
 * *destination* for a researcher-only account. Previously (see docs/decisions/0030) a
 * researcher-only account was sent to /programs directly; revised per explicit product
 * direction to match the researcher-lands-on-their-dashboard model.
 * Never inferred from email, never client-supplied. Shared by signInAction (the
 * just-authenticated case) and the sign-in page's own already-authenticated guard, so the
 * two can never quietly disagree. A platform admin who ALSO has real organization/
 * researcher standing (plausible: nothing stops a real user from also being a platform
 * admin) still lands on /platform/programs -- platform-admin status is checked first,
 * deliberately taking priority over any other real standing this account might have.
 */
export async function determineDefaultDestination(userId: string): Promise<Route> {
  const admin = await isPlatformAdmin();
  if (admin) return "/platform" as Route;

  const organizations = await listCurrentUserOrganizations(userId);
  const hasOrganization = organizations.length > 0;
  if (hasOrganization) {
    const participations = await listMyProgramParticipations(userId);
    if (participations.length === 0) return "/organizations" as Route;
  }
  return "/" as Route;
}
