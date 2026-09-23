import React from "react";
import { AppShellClient } from "./app-shell-client";
import { listCurrentUserOrganizations } from "../services/organizations";
import { countMyUnreadNotifications } from "../services/notifications";
import { listMyProgramParticipations } from "../services/program-researchers";
import { isPlatformAdmin } from "../services/platform-operations";
import { perfTimed } from "../lib/perf-trace";

type ShellUser = { id: string; displayName: string; email: string | null };

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
 * switcher existed. Omitted by a non-org-scoped page (the researcher dashboard, settings,
 * etc.), where there is no current organization to highlight.
 */
export async function AppShell({
  title,
  children,
  user,
  organizationId,
}: {
  title: string;
  children: React.ReactNode;
  user?: ShellUser | null;
  organizationId?: string;
}) {
  const [organizations, hasResearcherParticipation, unreadNotificationCount, isAdmin] = await perfTimed("AppShell 4-query batch", () =>
    Promise.all([
      user ? listCurrentUserOrganizations(user.id) : Promise.resolve([]),
      user ? listMyProgramParticipations().then((participations) => participations.length > 0) : Promise.resolve(false),
      user ? countMyUnreadNotifications(user.id) : Promise.resolve(0),
      // Real platform_admins membership (public.am_i_platform_admin), never a role
      // column -- see isPlatformAdmin's own comment. Only used here to decide whether the
      // one-line "Platform" entry point below renders; every /platform/* page still
      // independently re-checks this itself server-side (never trusts this alone).
      user ? isPlatformAdmin() : Promise.resolve(false),
    ]),
  );
  return (
    <AppShellClient
      title={title}
      user={user}
      organizations={organizations}
      currentOrganizationId={organizationId}
      hasResearcherParticipation={hasResearcherParticipation}
      unreadNotificationCount={unreadNotificationCount}
      isPlatformAdmin={isAdmin}
    >
      {children}
    </AppShellClient>
  );
}
