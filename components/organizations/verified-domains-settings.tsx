"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { ToneBadge, TONE } from "../ui/badge";
import { LocalTime } from "../ui/local-time";
import { addOrganizationDomainAction, checkOrganizationDomainAction, removeOrganizationDomainAction } from "../../actions/organization-domains";
import { txtRecordName, txtRecordValue } from "../../lib/domain-verification";
import type { OrganizationDomain } from "../../services/organization-domains";

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-ink">{value}</code>
        <Button variant="secondary" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void navigator.clipboard?.writeText(value).then(() => setCopied(true))}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

function DomainRow({ organizationId, domain, canManage }: { organizationId: string; domain: OrganizationDomain; canManage: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const verified = domain.status === "verified";

  function act(work: () => ReturnType<typeof checkOrganizationDomainAction>) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) setMessage(result.message);
      else if (result.verified === false) setMessage(result.message ?? "Not verified yet.");
      router.refresh();
    });
  }

  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="break-all font-mono text-sm font-medium text-ink">{domain.domain}</span>
          <ToneBadge tone={verified ? TONE.success : TONE.warning}>{verified ? "Verified" : "Pending"}</ToneBadge>
        </div>
        {canManage && (
          <div className="flex gap-2">
            {!verified && (
              <Button pending={pending} onClick={() => act(() => checkOrganizationDomainAction(organizationId, domain.id))}>
                Check DNS
              </Button>
            )}
            <Button variant="secondary" disabled={pending} onClick={() => act(() => removeOrganizationDomainAction(organizationId, domain.id))}>
              Remove
            </Button>
          </div>
        )}
      </div>
      {verified ? (
        <p className="text-xs text-ink-muted">
          Verified {domain.verifiedAt && <LocalTime value={domain.verifiedAt} dateOnly />}. {domain.domain} and every subdomain under it can be put in scope.
        </p>
      ) : (
        canManage && (
          <div className="grid grid-cols-1 gap-3">
            <p className="text-sm text-ink-muted">Add this TXT record at your DNS provider, then check. You can delete the record after verification.</p>
            <CopyValue label="Record name" value={txtRecordName(domain.domain)} />
            <CopyValue label="Record value" value={txtRecordValue(domain.token)} />
          </div>
        )
      )}
      {message && (
        <p role="alert" className="text-sm font-medium text-danger">
          {message}
        </p>
      )}
    </li>
  );
}

/** Organization settings: the domains this organization proved it controls (202610260008).
 * Only hosts under a verified domain authorize testing; everything else stays hidden from
 * researchers. Every rule is enforced in the database; this is only the control surface. */
export function VerifiedDomainsSettings({ organizationId, domains, canManage }: { organizationId: string; domains: OrganizationDomain[]; canManage: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addOrganizationDomainAction(organizationId, value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setValue("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {domains.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {domains.map((d) => (
            <DomainRow key={d.id} organizationId={organizationId} domain={d} canManage={canManage} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">No domains yet. Domain and URL targets stay hidden from researchers until their domain is verified here.</p>
      )}
      {canManage ? (
        <form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={handleAdd} noValidate>
          <Input label="Domain" value={value} onChange={(e) => setValue(e.target.value)} placeholder="example.com" className="min-w-0 flex-1 [&_input]:font-mono" maxLength={253} error={error ?? undefined} />
          <Button type="submit" pending={pending} className="sm:mt-6">
            Add domain
          </Button>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">Only an owner or security admin can add or verify domains.</p>
      )}
    </div>
  );
}
