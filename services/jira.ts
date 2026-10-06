import "server-only";
import { withActorTransaction, callRpc } from "@/lib/db/pool";
import { getCurrentUser } from "@/lib/auth/current-user";
import { mapRpcError as mapError } from "@/services/rpc-error";

/** Org-admin Jira connection management (db/migrations/202610010001_jira_integration.sql).
 * Every RPC re-derives the actor from auth.uid() and enforces owner/security_admin itself;
 * nothing here re-checks. No function in this file ever receives the plaintext token back
 * from the database -- only api_token_last4. */

export type JiraConnection = {
  siteUrl: string;
  accountEmail: string;
  apiTokenLast4: string;
  projectKey: string;
  issueTypeName: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
  lastErrorAt: string | null;
  linkedIssueCount: number;
};

type JiraConnectionRow = {
  site_url: string;
  account_email: string;
  api_token_last4: string;
  project_key: string;
  issue_type_name: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  last_error: string | null;
  last_error_at: string | null;
  linked_issue_count: string | number;
};

export type JiraConnectionInput = { siteUrl: string; accountEmail: string; apiToken: string; projectKey: string; issueTypeName: string };

async function actorId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

export async function getJiraConnection(organizationId: string): Promise<JiraConnection | null> {
  let rows: JiraConnectionRow[] = [];
  try {
    rows = await withActorTransaction(await actorId(), (client) => callRpc<JiraConnectionRow>(client, "public.get_jira_connection_for_org", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return null;
  return {
    siteUrl: row.site_url,
    accountEmail: row.account_email,
    apiTokenLast4: row.api_token_last4,
    projectKey: row.project_key,
    issueTypeName: row.issue_type_name,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastError: row.last_error,
    lastErrorAt: row.last_error_at,
    linkedIssueCount: Number(row.linked_issue_count),
  };
}

/** Returns the webhook secret -- the only time it ever leaves the database in plaintext
 * toward a browser. */
export async function createJiraConnection(organizationId: string, input: JiraConnectionInput): Promise<{ webhookSecret: string }> {
  let rows: { webhook_secret: string }[] = [];
  try {
    rows = await withActorTransaction(await actorId(), (client) =>
      callRpc<{ webhook_secret: string }>(client, "public.create_jira_connection", [organizationId, input.siteUrl, input.accountEmail, input.apiToken, input.projectKey, input.issueTypeName]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { webhookSecret: rows[0].webhook_secret };
}

/** Blank apiToken keeps the stored one. site_url is immutable (see the migration header). */
export async function updateJiraConnection(organizationId: string, input: Omit<JiraConnectionInput, "siteUrl">): Promise<void> {
  try {
    await withActorTransaction(await actorId(), (client) =>
      callRpc(client, "public.update_jira_connection", [organizationId, input.accountEmail, input.apiToken, input.projectKey, input.issueTypeName]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function deleteJiraConnection(organizationId: string): Promise<void> {
  try {
    await withActorTransaction(await actorId(), (client) => callRpc(client, "public.delete_jira_connection", [organizationId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export type ReportJiraLink = { issueKey: string; issueUrl: string; lastSyncedAt: string };

/** Null for "no link" and "not allowed to see it" alike (the RPC returns no row for both). */
export async function getReportJiraLink(reportId: string): Promise<ReportJiraLink | null> {
  let rows: { jira_issue_key: string; jira_issue_url: string; last_synced_at: string }[] = [];
  try {
    rows = await withActorTransaction(await actorId(), (client) => callRpc(client, "public.get_report_jira_link", [reportId]));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return row ? { issueKey: row.jira_issue_key, issueUrl: row.jira_issue_url, lastSyncedAt: row.last_synced_at } : null;
}

/** Shown to the admin so they can paste it into Jira's webhook settings. Not a secret. */
export function jiraWebhookUrl(organizationId: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "")}/api/webhooks/jira/${organizationId}`;
}
