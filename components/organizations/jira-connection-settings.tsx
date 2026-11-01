"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { Dialog } from "../ui/navigation";
import { MetadataPair } from "../ui/security-primitives";
import { LocalTime } from "../ui/local-time";
import { PasswordInput } from "../auth/password-input";
import { createJiraConnectionAction, deleteJiraConnectionAction, updateJiraConnectionAction } from "../../actions/jira";
import type { JiraConnection } from "../../services/jira";

type Field = "siteUrl" | "accountEmail" | "apiToken" | "projectKey" | "issueTypeName";

// RPC error code -> the field it is about, so the message lands under that input.
const FIELD_FOR_CODE: Record<string, Field> = {
  INVALID_JIRA_SITE: "siteUrl",
  INVALID_JIRA_EMAIL: "accountEmail",
  INVALID_JIRA_TOKEN: "apiToken",
  INVALID_JIRA_PROJECT: "projectKey",
  INVALID_JIRA_ISSUE_TYPE: "issueTypeName",
};

const TOKEN_PAGE = "https://id.atlassian.com/manage-profile/security/api-tokens";

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-sm text-ink">{value}</code>
        <Button
          variant="secondary"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function ConnectionForm({
  organizationId,
  existing,
  onCreated,
  onDone,
}: {
  organizationId: string;
  existing: JiraConnection | null;
  onCreated: (secret: string, projectKey: string) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    siteUrl: existing?.siteUrl ?? "",
    accountEmail: existing?.accountEmail ?? "",
    apiToken: "",
    projectKey: existing?.projectKey ?? "",
    issueTypeName: existing?.issueTypeName ?? "Bug",
  });
  const [fieldError, setFieldError] = useState<{ field: Field; message: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (field: Field) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (fieldError?.field === field) setFieldError(null);
  };
  const errorFor = (field: Field) => (fieldError?.field === field ? fieldError.message : undefined);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFieldError(null);
    setFormError(null);
    startTransition(async () => {
      const result = existing
        ? await updateJiraConnectionAction({ organizationId, accountEmail: values.accountEmail, apiToken: values.apiToken, projectKey: values.projectKey, issueTypeName: values.issueTypeName })
        : await createJiraConnectionAction({ organizationId, ...values });
      if (!result.ok) {
        const field = FIELD_FOR_CODE[result.code];
        if (field) setFieldError({ field, message: result.message });
        else setFormError(result.message);
        return;
      }
      if (!existing && result.data) onCreated(result.data.webhookSecret, values.projectKey.trim().toUpperCase());
      onDone();
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <Input
        label="Jira site URL"
        required={!existing}
        disabled={Boolean(existing)}
        placeholder="https://yourcompany.atlassian.net"
        helperText={existing ? "To connect a different Jira site, disconnect first." : "Your Jira Cloud address."}
        value={values.siteUrl}
        onChange={set("siteUrl")}
        error={errorFor("siteUrl")}
        autoComplete="off"
      />
      <Input
        label="Account email"
        type="email"
        required
        helperText="The Jira user the API token belongs to. Issues and comments are created as this user."
        value={values.accountEmail}
        onChange={set("accountEmail")}
        error={errorFor("accountEmail")}
        autoComplete="off"
      />
      <PasswordInput
        label="API token"
        required={!existing}
        autoComplete="off"
        helperText={existing ? `Leave blank to keep the current token (ending ${existing.apiTokenLast4}).` : "Create one at id.atlassian.com → Security → API tokens."}
        value={values.apiToken}
        onChange={set("apiToken")}
        error={errorFor("apiToken")}
        labelExtra={
          <a href={TOKEN_PAGE} target="_blank" rel="noreferrer" className="text-xs font-medium text-action hover:text-action-hover">
            Get a token ↗
          </a>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Project key" required placeholder="SEC" value={values.projectKey} onChange={set("projectKey")} error={errorFor("projectKey")} autoComplete="off" />
        <Input label="Issue type" required helperText="Must exist in that project." value={values.issueTypeName} onChange={set("issueTypeName")} error={errorFor("issueTypeName")} autoComplete="off" />
      </div>
      {formError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {formError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        {existing && (
          <Button variant="secondary" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        )}
        <Button type="submit" pending={pending}>
          {existing ? "Save changes" : "Connect Jira"}
        </Button>
      </div>
    </form>
  );
}

function DisconnectButton({ organizationId, connection }: { organizationId: string; connection: JiraConnection }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = () => {
    if (pending) return;
    setOpen(false);
    setError(null);
  };
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Disconnect
      </Button>
      <Dialog open={open} title="Disconnect Jira?" onClose={close}>
        <div className="space-y-4">
          <div className="space-y-2 text-sm text-ink-muted">
            <p>
              Unpatched stops creating and updating issues in <span className="font-mono font-semibold text-ink">{connection.siteUrl.replace("https://", "")}</span>, and the stored API token and
              webhook secret are deleted. Status changes from Jira are no longer accepted.
            </p>
            <p>
              Existing Jira issues are not touched, but the links from {connection.linkedIssueCount} report{connection.linkedIssueCount === 1 ? "" : "s"} to their issues are removed. If you
              reconnect, reports updated afterwards get new issues.
            </p>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              pending={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteJiraConnectionAction({ organizationId });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Disconnect Jira
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Org settings → Integrations → Jira Cloud. Owner/security_admin only (the page renders
 * this only when canManageIntegrations; every RPC re-checks). The webhook secret is shown
 * exactly once, right after connecting, the same way personal access tokens are. */
export function JiraConnectionSettings({ organizationId, connection, webhookUrl }: { organizationId: string; connection: JiraConnection | null; webhookUrl: string }) {
  const [editing, setEditing] = useState(false);
  const [created, setCreated] = useState<{ secret: string; projectKey: string } | null>(null);

  return (
    <div className="space-y-5">
      {created && (
        <div className="space-y-4 rounded-lg border border-border bg-surface p-4" data-testid="jira-webhook-setup">
          <Alert tone="success" title="Jira connected. One step left: add the webhook in Jira.">
            Copy the secret now. It will never be shown again. Without this webhook, issues are still created and updated, but closing an issue in Jira won&apos;t resolve the report here.
          </Alert>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
            <li>In Jira, open Settings → System → WebHooks → Create a WebHook.</li>
            <li>Paste the URL and secret below.</li>
            <li>
              Under Events, select Issue → updated, and set the JQL filter to <code className="font-mono">project = {created.projectKey}</code>.
            </li>
          </ol>
          <CopyValue label="Webhook URL" value={webhookUrl} />
          <CopyValue label="Webhook secret" value={created.secret} />
        </div>
      )}

      {!connection ? (
        <>
          <p className="text-sm text-ink-muted">
            Create a Jira issue for every new report, keep it in step as the report is triaged and closed, and resolve the report here when engineering moves the issue to Done.
            Unpatched uses an API token from your own Jira account. Nothing is installed in Jira.
          </p>
          <ConnectionForm organizationId={organizationId} existing={null} onCreated={(secret, projectKey) => setCreated({ secret, projectKey })} onDone={() => {}} />
        </>
      ) : editing ? (
        <ConnectionForm organizationId={organizationId} existing={connection} onCreated={() => {}} onDone={() => setEditing(false)} />
      ) : (
        <div className="space-y-4" data-testid="jira-connection-status">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected
            </span>
            <a href={connection.siteUrl} target="_blank" rel="noreferrer" className="font-mono text-sm text-action hover:text-action-hover">
              {connection.siteUrl.replace("https://", "")} ↗
            </a>
          </div>
          {connection.lastError && (
            <Alert tone="danger" title="The last sync to Jira failed">
              <span className="break-words">{connection.lastError}</span>
              {connection.lastErrorAt && (
                <span className="block text-xs">
                  <LocalTime value={connection.lastErrorAt} />
                </span>
              )}
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-4">
            <MetadataPair label="Project" value={connection.projectKey} mono />
            <MetadataPair label="Issue type" value={connection.issueTypeName} />
            <MetadataPair label="Account" value={connection.accountEmail} mono />
            <MetadataPair label="API token" value={`•••• ${connection.apiTokenLast4}`} mono />
            <MetadataPair label="Connected by" value={connection.createdByName ?? "Former member"} />
            <MetadataPair label="Connected on" value={<LocalTime value={connection.createdAt} />} />
            <MetadataPair label="Linked reports" value={String(connection.linkedIssueCount)} />
          </div>
          <p className="text-xs text-ink-muted">
            Status changes from Jira are applied as {connection.createdByName ?? "the member who connected Jira"}. If that person loses triage access, inbound changes stop until Jira is
            reconnected.
          </p>
          <CopyValue label="Webhook URL" value={webhookUrl} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit connection
            </Button>
            <DisconnectButton organizationId={organizationId} connection={connection} />
          </div>
        </div>
      )}
    </div>
  );
}
