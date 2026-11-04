import "server-only";
import { makeStudioAsset, type StudioAsset, type StudioResearcher } from "@/lib/launch-program-studio";
import { listOrganizationAssets } from "@/services/scope";
import { listOrganizationDomains } from "@/services/organization-domains";
import { getPublicLeaderboard } from "@/services/reputation";
import { listResearchersForOrganization } from "@/services/organization-analytics";
import { listOrganizationMembers } from "@/services/organization-members";
import { getJiraConnection } from "@/services/jira";
import { organizationHasServiceNow } from "@/services/servicenow";
import { listChatConnections, listWebhookEndpoints } from "@/services/org-integrations";
import { getCodeHostState } from "@/services/code-hosts";

// Everything the Launch Program Studio shows, from the organization's real data. Each read is
// allowed to fail on its own (a role that can't read integrations still gets assets).

const settle = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);

function researcher(id: string, username: string, name: string, cohort: StudioResearcher["cohortCategory"], score: number, resolved: number, bounties: number): StudioResearcher {
  return {
    id,
    handle: username,
    name,
    avatarInitials: name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?",
    country: "",
    countryCode: "",
    cohortCategory: cohort,
    reputation: score,
    signalScore: 0,
    acceptanceRate: 0,
    averageSeverity: "Medium",
    responseTimeHours: 0,
    recentActivity: "",
    skills: [],
    languages: [],
    industryExperience: [],
    availability: "Available Now",
    verifiedKyc: false,
    pastValidReports: resolved,
    bountiesFinalized: bounties,
  };
}

export async function loadLaunchStudioData(organizationId: string): Promise<{ assets: StudioAsset[]; researchers: StudioResearcher[]; connectedModuleIds: string[]; members: { id: string; name: string }[] }> {
  const [assetPage, domains, leaderboard, pastResearchers, jira, servicenow, chats, webhooks, codeHosts, orgMembers] = await Promise.all([
    settle(listOrganizationAssets(organizationId), { items: [], nextCursor: null }),
    settle(listOrganizationDomains(organizationId), []),
    settle(getPublicLeaderboard(30), []),
    settle(listResearchersForOrganization(organizationId), []),
    settle(getJiraConnection(organizationId), null),
    settle(organizationHasServiceNow(organizationId), false),
    settle(listChatConnections(organizationId), []),
    settle(listWebhookEndpoints(organizationId), []),
    settle(getCodeHostState(organizationId), { connections: [], repositories: [] }),
    settle(listOrganizationMembers(organizationId), []),
  ]);

  const verified = domains.filter((d) => d.status === "verified").map((d) => d.domain);
  const assets = assetPage.items.map((a) => {
    const host = a.displayIdentifier.toLowerCase().replace(/^\*\./, "").replace(/^https?:\/\//, "").split(/[/:]/)[0];
    return makeStudioAsset(a.id, a.assetType, a.displayIdentifier, verified.some((d) => host === d || host.endsWith(`.${d}`)), { openReports: a.openReports });
  });

  const board = leaderboard.filter((r) => r.researcherId && r.username);
  const byUsername = new Map(board.map((r) => [r.username!, r]));
  const researchers: StudioResearcher[] = [
    ...pastResearchers
      .filter((r) => r.username)
      .map((r) => {
        const pub = byUsername.get(r.username!);
        return researcher(`past:${r.username}`, r.username!, r.displayName, "Past Participants", pub ? Number(pub.score) : 0, r.resolvedCount, pub?.bountyFinalizedCount ?? 0);
      }),
    ...board.map((r, i) => researcher(`lb:${r.username}`, r.username!, r.displayName, i < 5 ? "Top Performers" : "Recommended Researchers", Number(r.score), r.resolvedCount, r.bountyFinalizedCount)),
  ];

  const connected = ["email"];
  if (jira) connected.push("jira");
  if (servicenow) connected.push("servicenow");
  for (const c of chats) if (c.status === "active") connected.push(c.provider);
  if (webhooks.length > 0) connected.push("webhooks");
  for (const c of codeHosts.connections) if (c.status === "active") connected.push(c.provider);
  const members = orgMembers.filter((m) => m.status === "active").map((m) => ({ id: m.userId, name: m.displayName }));
  return { assets, researchers, connectedModuleIds: [...new Set(connected)], members };
}
