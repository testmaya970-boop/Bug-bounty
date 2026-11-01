"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/form";
import { Alert } from "../ui/feedback";
import { startGithubInstallAction, connectGitlabAction, setProgramRepositoryAction, createReportIssueAction } from "../../actions/code-hosts";

export function InstallGithubButton({ organizationId }: { organizationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await startGithubInstallAction(organizationId);
            if (!r.ok) return setError(r.message);
            if (r.url) window.location.assign(r.url);
          })
        }
      >
        Install the GitHub App
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}

export function GitlabConnectForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("https://gitlab.com");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hook, setHook] = useState<{ webhookUrl: string; secret: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const r = await connectGitlabAction({ organizationId, baseUrl, token });
          if (!r.ok) return setError(r.message);
          if (r.webhookUrl && r.secret) setHook({ webhookUrl: r.webhookUrl, secret: r.secret });
          setToken("");
          router.refresh();
        });
      }}
    >
      {hook && (
        <Alert tone="warning" title="Add this webhook in GitLab now. The secret token won't be shown again.">
          <p className="mt-1">Project settings, Webhooks: URL and secret token below, trigger &ldquo;Issues events&rdquo;.</p>
          <code className="mt-2 block break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink">{hook.webhookUrl}</code>
          <code className="mt-2 block break-all rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs text-ink">{hook.secret}</code>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="GitLab URL" helperText="gitlab.com or your self-managed instance (https)." value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <Input label="Access token" type="password" autoComplete="off" helperText="Project or group access token, api scope, Reporter or above." value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" pending={pending}>
        Connect GitLab
      </Button>
    </form>
  );
}

export function RepositoryPicker({
  organizationId,
  programId,
  provider,
  current,
  choices,
}: {
  organizationId: string;
  programId: string;
  provider: "github" | "gitlab";
  current: string | null;
  choices: { fullName: string; private: boolean }[] | null;
}) {
  const router = useRouter();
  const [repo, setRepo] = useState(current ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        startTransition(async () => {
          const r = await setProgramRepositoryAction({ organizationId, programId, provider, repo });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.message });
          if (r.ok) router.refresh();
        });
      }}
    >
      {choices ? (
        <Select label="Repository" value={repo} onChange={(e) => setRepo(e.target.value)} className="min-w-0 flex-1">
          <option value="">Choose a private repository</option>
          {choices.map((c) => (
            <option key={c.fullName} value={c.fullName} disabled={!c.private}>
              {c.fullName}
              {c.private ? "" : " (public, not allowed)"}
            </option>
          ))}
        </Select>
      ) : (
        <Input label="Project path" placeholder="group/project" value={repo} onChange={(e) => setRepo(e.target.value)} className="min-w-0 flex-1" />
      )}
      <Button type="submit" variant="secondary" pending={pending}>
        Save
      </Button>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-success" : "text-danger"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}

export function CreateIssueButton({ organizationId, programId, reportId, provider }: { organizationId: string; programId: string; reportId: string; provider: "github" | "gitlab" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        pending={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await createReportIssueAction(organizationId, programId, reportId, provider);
            if (!r.ok) return setError(r.message);
            router.refresh();
          })
        }
      >
        Create {provider === "github" ? "GitHub" : "GitLab"} issue
      </Button>
      {error && (
        <span role="alert" className="text-xs font-medium text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
