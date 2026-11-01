import React from "react";
import { cookies, headers } from "next/headers";
import { AppShellClient } from "./app-shell-client";
import { SIDEBAR_COOKIE } from "../lib/sidebar";
import { listCurrentUserOrganizations } from "../services/organizations";
import { countMyUnreadNotifications } from "../services/notifications";
import { listMyProgramParticipations } from "../services/program-researchers";
import { getMyPlatformStaff } from "../services/managed-triage";
import { perfTimed } from "../lib/perf-trace";
import { LAST_ORGANIZATION_COOKIE, PLATFORM_ADMIN_NEEDS_MFA_HEADER } from "../lib/session/middleware";

type ShellUser = { id: string; displayName: string; email: string | null };

/** Pure so it's directly unit-testable (AppShell itself is an async Server Component and
 * can't be rendered via renderToStaticMarkup -- see this file's own callers/tests). Never
 * trusts the cookie value alone: `organizations` is the same real-membership list AppShell
 * already fetched from listCurrentUserOrganizations, so a stale cookie naming an org this
 * user has since left, or an outright tampered value, resolves to undefined -- identical to
 * having no cookie at all -- never to a wrong organization. */
export function resolveLastOrganizationId(lastOrganizationId: string | undefined, organizations: { id: string }[]): string | undefined {
  if (!lastOrganizationId) return undefined;
  return organizations.some((org) => org.id === lastOrganizationId) ? lastOrganizationId : undefined;
}

/**
 * A thin Server Component wrapper -- every caller keeps the exact `<AppShell title=...
 * user={...}>` signature it already had; nothing else changes for a caller that doesn't
 * pass the new, optional `organizationId` prop. Decides, server-side, whether this
 * signed-in user has anything real behind "Organizations" (organizations.length > 0,
 * replacing the old hasAnyOrganizationMembership() boolean-only check -- listing the real
 * rows once covers both the boolean and the switcher's own data, one query instead of
 * two) AND whether they have any real researcher standing (hasResearcherParticipation --
 * listMyProgramParticipations().length > 0, the identical signal
 * lib/auth/default-destination.ts's determineDefaultDestination() already uses for
 * sign-in routing; reused here, not a second definition of "is this person a
 * researcher"), plus the real unread-notification count the header bell's badge shows.
 * Both context signals are real relationship data, never a role column -- there is no
 * persistent role in this schema by design (docs/decisions/0030). An anonymous caller
 * (user is null/undefined, e.g. a permission-denied branch reached before redirect) skips
 * every check -- nothing renders without something real behind it.
 *
 * `organizationId`: an org-scoped page passes its own real `params.organizationId` so the
 * sidebar's Organization Switcher can highlight "you are here" and switching organizations
 * actually changes context (docs/decisions/0075) -- never a second, divergent org-context
 * mechanism; the URL segment IS the context, exactly as it already was before any
 * switcher existed.
 *
 * A caller that omits it (a non-org-scoped page: Help, Settings, Notifications) falls back
 * to the `last_organization_id` cookie -- the real org the user most recently navigated
 * INTO (set by lib/session/middleware.ts only when the URL itself named an org, never a
 * guess) -- so the sidebar's org nav groups persist across the whole app instead of
 * vanishing the moment you leave an org-scoped URL. This is NOT the same thing as the
 * array-order fallback the switcher's own display uses (organizations[0], purely cosmetic)
 * -- that one caused a real, previously-fixed bug (guessed org context made a nav link
 * silently open the wrong organization's data), which is exactly why the fallback here
 * re-validates the cookie's id against this user's own real memberships (`organizations`,
 * the same list already fetched below) before ever trusting it: a stale cookie naming an
 * org this user has since left, or a tampered value, resolves to `undefined` -- the
 * existing "nothing real behind it, don't guess" behavior -- never to a wrong org.
 */
export async function AppShell({
  title,
  titleIsSection = false,
  children,
  user,
  organizationId,
}: {
  title: string;
  /** The title names a section and each child page renders its own <h1> (Settings). */
  titleIsSection?: boolean;
  children: React.ReactNode;
  user?: ShellUser | null;
  organizationId?: string;
}) {
  const [organizations, hasResearcherParticipation, unreadNotificationCount, staff] = await perfTimed("AppShell 4-query batch", () =>
    Promise.all([
      user ? listCurrentUserOrganizations(user.id) : Promise.resolve([]),
      user ? listMyProgramParticipations().then((participations) => participations.length > 0) : Promise.resolve(false),
      user ? countMyUnreadNotifications(user.id) : Promise.resolve(0),
      // Real platform_admins membership (public.am_i_platform_admin), never a role
      // column -- see isPlatformAdmin's own comment. Only used here to decide whether the
      // one-line "Platform" entry point below renders; every /platform/* page still
      // independently re-checks this itself server-side (never trusts this alone).
      // + triage-analyst status, in the same single query (get_my_platform_staff).
      user ? getMyPlatformStaff() : Promise.resolve({ platformAdmin: false, triageAnalyst: false, analystNeedsMfa: false }),
    ]),
  );

  const resolvedOrganizationId = organizationId ?? (user ? resolveLastOrganizationId((await cookies()).get(LAST_ORGANIZATION_COOKIE)?.value, organizations) : undefined);
  const platformAdminNeedsMfa = (await headers()).get(PLATFORM_ADMIN_NEEDS_MFA_HEADER) === "1";
  // Read here so the first paint already has the right sidebar width (no flash of the open one).
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <AppShellClient
      title={title}
      titleIsSection={titleIsSection}
      user={user}
      organizations={organizations}
      currentOrganizationId={resolvedOrganizationId}
      hasResearcherParticipation={hasResearcherParticipation}
      unreadNotificationCount={unreadNotificationCount}
      isPlatformAdmin={staff.platformAdmin}
      isTriageAnalyst={staff.triageAnalyst || staff.analystNeedsMfa}
      platformAdminNeedsMfa={platformAdminNeedsMfa}
      initialSidebarCollapsed={sidebarCollapsed}
    >
      {children}
    </AppShellClient>
  );
}
