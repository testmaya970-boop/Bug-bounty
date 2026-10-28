import { withServiceRoleTransaction, callRpc } from "../outbox/db-pool";
import { RetryableHandlerError } from "../outbox/registry";
import { githubAppConfig, githubCommentAndClose, githubInstallationToken, gitlabCommentAndClose } from "@/lib/integrations/code-hosts";
import type { OutboxEvent } from "@/types/outbox";

// Outbound status sync to GitHub / GitLab (202610290004): when a report closes in Unpatched, its
// open issues get a short comment (no vulnerability details) and are closed. A no-op for reports
// without a linked issue. Idempotent: only links still marked open are touched.

const CLOSING: Record<string, string> = {
  "report.resolved": "Marked resolved in Unpatched.",
  "report.duplicate": "Closed in Unpatched as a duplicate.",
  "report.informative": "Closed in Unpatched as informative.",
  "report.not_applicable": "Closed in Unpatched as not applicable.",
  "report.rejected": "Closed in Unpatched as rejected.",
};
export const CODE_HOST_SYNC_EVENT_TYPES = Object.keys(CLOSING);

type Link = { report_id: string; provider: "github" | "gitlab"; connection_id: string; repo_id: string; repo_full_name: string; issue_number: number };
type Creds = { provider: string; github_installation_id: string | null; gitlab_base_url: string | null; token: string | null };

export async function handleCodeHostSync(event: OutboxEvent): Promise<void> {
  const reportId = (event.payload.report_id as string | undefined) ?? event.aggregateId;
  const links = await withServiceRoleTransaction((c) =>
    c.query<Link>("select report_id, provider, connection_id, repo_id, repo_full_name, issue_number from public.report_issue_links where report_id = $1 and state = 'open'", [reportId]).then((r) => r.rows),
  );
  for (const link of links) {
    const [creds] = await withServiceRoleTransaction((c) => callRpc<Creds>(c, "private.code_host_credentials", [link.connection_id]));
    if (!creds) continue;
    try {
      if (link.provider === "github") {
        const cfg = githubAppConfig();
        if (!cfg || !creds.github_installation_id) continue;
        await githubCommentAndClose(cfg, await githubInstallationToken(cfg, creds.github_installation_id), link.repo_full_name, link.issue_number, CLOSING[event.eventType], true);
      } else {
        await gitlabCommentAndClose(creds.gitlab_base_url!, creds.token!, link.repo_id, link.issue_number, CLOSING[event.eventType], true);
      }
      await withServiceRoleTransaction((c) => c.query("update public.report_issue_links set state = 'closed', last_synced_at = now() where report_id = $1 and provider = $2", [link.report_id, link.provider]));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await withServiceRoleTransaction((c) => callRpc(c, "private.record_code_host_error", [link.connection_id, message])).catch(() => null);
      throw new RetryableHandlerError(`code host sync failed: ${message}`);
    }
  }
}
