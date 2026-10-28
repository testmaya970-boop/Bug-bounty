import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../components/ui/navigation";
import { PermissionDenied, Alert } from "../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../components/ui/security-primitives";
import { ToneBadge, TONE } from "../../../../../components/ui/badge";
import { ActionButton } from "../../../../../components/researcher/journey-controls";
import { ScimTokenButton, SsoConfigForm, SsoStateControls } from "../../../../../components/integrations/sso-forms";
import { getSsoConnection, ssoUrls } from "../../../../../services/sso";
import { listOrganizationDomains } from "../../../../../services/organization-domains";
import { deleteSsoAction } from "../../../../../actions/sso";
import { requireIntegrationAdmin } from "../guard";

function Copyable({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <code className="mt-1 block break-all rounded-md border border-border bg-surface-muted px-3 py-2 font-mono text-xs text-ink">{value}</code>
    </div>
  );
}

/** SAML single sign-on and SCIM provisioning (202610290006). Works with any SAML 2.0 identity
 * provider the organization already has (Okta, Microsoft Entra ID, Google Workspace, OneLogin,
 * JumpCloud...); no broker. */
export default async function SsoPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const { user, allowed } = await requireIntegrationAdmin(organizationId, `/organizations/${organizationId}/integrations/sso`);
  if (!allowed) {
    return (
      <AppShell title="Single sign-on" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an owner or security admin can manage single sign-on.</PermissionDenied>
      </AppShell>
    );
  }
  const [conn, domains] = await Promise.all([getSsoConnection(organizationId), listOrganizationDomains(organizationId)]);
  const verified = domains.filter((d) => d.status === "verified").map((d) => d.domain);
  const urls = conn ? ssoUrls(conn.id) : null;

  return (
    <AppShell title="Single sign-on" user={user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-8">
        <Breadcrumbs items={[{ label: "Integrations", href: `/organizations/${organizationId}/integrations` }, { label: "Single sign-on" }]} />
        <p className="text-sm text-ink-muted">
          Members sign in through your identity provider (SAML 2.0) using their email on your verified domains. Assertions must be signed; each can be used once. MFA you set up in Unpatched
          still applies. When single sign-on is required, owners keep their password so you can never lock yourself out.
        </p>
        {verified.length === 0 ? (
          <Alert tone="warning" title="Verify an email domain first.">
            Single sign-on only covers domains you have proved you own.{" "}
            <Link prefetch={false} href={`/organizations/${organizationId}/settings#verified-domains` as Route} className="font-medium underline underline-offset-2">
              Verify a domain
            </Link>
          </Alert>
        ) : (
          <p className="text-sm text-ink-muted">Covers: {verified.join(", ")}</p>
        )}

        {urls && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SectionLabel>Your identity provider needs</SectionLabel>
              <ToneBadge tone={conn!.status === "active" ? TONE.success : TONE.muted}>{conn!.status === "active" ? (conn!.enforced ? "Required" : "On") : "Off"}</ToneBadge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Copyable label="ACS (reply) URL" value={urls.acsUrl} />
              <Copyable label="Entity ID (audience)" value={urls.entityId} />
              <Copyable label="Metadata URL" value={urls.metadataUrl} />
              <Copyable label="Name ID format" value="Email address" />
            </div>
            <SsoStateControls organizationId={organizationId} active={conn!.status === "active"} enforced={conn!.enforced} />
          </section>
        )}

        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>{conn ? "Identity provider" : "Set up"}</SectionLabel>
          <SsoConfigForm organizationId={organizationId} existing={conn} />
        </section>

        {urls && (
          <section className="space-y-3 border-t border-border pt-6">
            <SectionLabel>Provisioning (SCIM 2.0)</SectionLabel>
            <p className="text-sm text-ink-muted">
              Your identity provider can create people and remove their access automatically. Removing someone suspends their membership and signs them out everywhere. Owners are never changed by
              provisioning.
            </p>
            <Copyable label="SCIM base URL" value={urls.scimBase} />
            {conn!.scimTokenLast4 && <p className="text-xs text-ink-muted">Current token ends in {conn!.scimTokenLast4}.</p>}
            <ScimTokenButton organizationId={organizationId} hasToken={Boolean(conn!.scimTokenLast4)} />
          </section>
        )}

        {conn && (
          <section className="border-t border-border pt-6">
            <ActionButton variant="destructive" action={deleteSsoAction.bind(null, organizationId)} confirm="Members sign in with passwords again. Provisioning stops." confirmLabel="Remove single sign-on?">
              Remove single sign-on
            </ActionButton>
          </section>
        )}
      </div>
    </AppShell>
  );
}
