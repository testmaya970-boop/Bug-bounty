import "server-only";
import type { Route } from "next";
import { listCurrentUserOrganizations } from "@/services/organizations";
import { listMyProgramParticipations } from "@/services/program-researchers";

/**
 * Real, server-derived context, never a guessed role -- an org-only account goes to
 * /organizations; every other account (researcher-only, both, or neither yet) lands on
 * "/", the real researcher dashboard (reputation, ledger, my reports, recommended
 * programs) -- matching the HackerOne/Bugcrowd model of "sign-in takes you to your own
 * dashboard, not the public program directory." /programs remains reachable as its own
 * page (and correctly serves both anonymous visitors browsing public programs and a
 * signed-in researcher's own "My programs"/"Invitations" tabs) -- it is simply no longer
 * the sign-in *destination* for a researcher-only account. Previously (see
 * docs/decisions/0030) a researcher-only account was sent to /programs directly; revised
 * per explicit product direction to match the researcher-lands-on-their-dashboard model.
 * Never inferred from email, never client-supplied. Shared by signInAction (the
 * just-authenticated case) and the sign-in page's own already-authenticated guard, so the
 * two can never quietly disagree.
 */
export async function determineDefaultDestination(userId: string): Promise<Route> {
  const organizations = await listCurrentUserOrganizations(userId);
  const hasOrganization = organizations.length > 0;
  if (hasOrganization) {
    const participations = await listMyProgramParticipations(userId);
    if (participations.length === 0) return "/organizations" as Route;
  }
  return "/" as Route;
}
