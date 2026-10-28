import React from "react";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied, Alert } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { ActionButton } from "../../../../../components/researcher/journey-controls";
import { GitlabConnectForm, InstallGithubButton, RepositoryPicker } from "../../../../../components/integrations/code-host-forms";
import { getCodeHostState, githubAppAvailable, listGithubRepositories, type CodeHostConnection } from "../../../../../services/code-hosts";
import { listProgramsForOrganization } from "../../../../../services/programs";
import { clearProgramRepositoryAction, disconnectCodeHostAction } from "../../../../../actions/code-hosts";
import { requireIntegrationAdmin } from "../guard";

/** GitHub and GitLab (202610290004): issues for accepted reports, in private repositories only. */
export default async function CodeHostsPage({ params, searchParams }: { params: Promise<{ organizationId: string }>; searchParams: Promise<{ github?: string; github_error?: string }> }) {
  const [{ organizationId }, { github, github_error: githubError }] = await Promise.all([params, searchParams]);
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/code`);
  if (!allowed) {
    return (
      <AppShell title="GitHub and GitLab" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage code integrations.</PermissionDenied>
      </AppShell>
    );
  }
  const [{ connections, repositories }, programs] = await Promise.all([getCodeHostState(organizationId), listProgramsForOrganization(organizationId)]);
  const gh = connections.find((c) => c.provider === "github");
  const gl = connections.find((c) => c.provider === "gitlab");
  const ghRepos = gh ? await listGithubRepositories(organizationId, gh.id) : [];
  const appReady = githubAppAvailable();

  return (
    <AppShell title="GitHub and GitLab" user={user} organizationId={organizationId}>
      <div className="max-w-5xl space-y-8">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "GitHub and GitLab" }]} />
        {github === "connected" && <Alert tone="success" title="GitHub connected." />}
        {githubError && <Alert tone="danger" title="GitHub wasn't connected.">{githubError.slice(0, 200)}</Alert>}
        <p className="text-sm text-ink-muted">
          Triage staff can turn an accepted report into an issue in the program&apos;s repository. Issues contain the vulnerability details, so only a <strong>private</strong> repository can be chosen,
          and it is checked again before every issue is created. When the report closes in Unpatched the issue is closed; when the issue is closed, an accepted report is marked resolved.
        </p>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0 space-y-3 rounded-lg border border-border p-4">
            <SectionLabel>GitHub</SectionLabel>
            {gh ? (
              <ConnectionSummary organizationId={organizationId} c={gh} name="GitHub" />
            ) : appReady ? (
              <>
                <p className="text-sm text-ink-muted">Install the Unpatched GitHub App on your organization and choose which repositories it can see.</p>
                <InstallGithubButton organizationId={organizationId} />
              </>
            ) : (
              <p className="text-sm text-ink-muted">The Unpatched GitHub App isn&apos;t configured on this server yet (platform setting).</p>
            )}
          </div>
          <div className="min-w-0 space-y-3 rounded-lg border border-border p-4">
            <SectionLabel>GitLab</SectionLabel>
            {gl ? <ConnectionSummary organizationId={organizationId} c={gl} name="GitLab" /> : <GitlabConnectForm organizationId={organizationId} />}
          </div>
        </section>

        {(gh || gl) && (
          <section className="space-y-3 border-t border-border pt-6">
            <SectionLabel>Repository per program</SectionLabel>
            {programs.length === 0 ? (
              <p className="text-sm text-ink-muted">No programs yet.</p>
            ) : (
              <ul className="space-y-4">
                {programs.map((p) => (
                  <li key={p.id} className="space-y-3 rounded-lg border border-border p-4">
                    <p className="text-sm font-medium text-ink">{p.name}</p>
                    {(["github", "gitlab"] as const)
                      .filter((prov) => (prov === "github" ? gh : gl))
                      .map((prov) => {
                        const current = repositories.find((r) => r.programId === p.id && r.provider === prov);
                        return (
                          <div key={prov} className="space-y-1">
                            <p className="text-xs font-semibold text-ink-muted">
                              {prov === "github" ? "GitHub" : "GitLab"}
                              {current && (
                                <>
                                  {": "}
                                  <a href={current.repoUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-action underline underline-offset-2">
                                    {current.repoFullName}
                                  </a>
                                </>
                              )}
                            </p>
                            <RepositoryPicker
                              organizationId={organizationId}
                              programId={p.id}
                              provider={prov}
                              current={current?.repoFullName ?? null}
                              choices={prov === "github" ? ghRepos.map((r) => ({ fullName: r.fullName, private: r.private })) : null}
                            />
                            {current && (
                              <ActionButton variant="quiet" action={clearProgramRepositoryAction.bind(null, organizationId, p.id, prov)}>
                                Stop creating issues for this program
                              </ActionButton>
                            )}
                          </div>
                        );
                      })}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AppShell>
  );
}

function ConnectionSummary({ organizationId, c, name }: { organizationId: string; c: CodeHostConnection; name: string }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-ink">
        Connected to <span className="font-mono">{c.accountLabel}</span>
        {c.tokenLast4 && <span className="text-ink-muted"> · token ending {c.tokenLast4}</span>}
      </p>
      {c.lastError && <p className="text-sm text-danger">Last error: {c.lastError}</p>}
      <ActionButton variant="destructive" action={disconnectCodeHostAction.bind(null, organizationId, c.id)} confirm={`Unpatched stops creating and updating ${name} issues. Existing issues stay in ${name}.`} confirmLabel={`Disconnect ${name}?`}>
        Disconnect
      </ActionButton>
    </div>
  );
}
