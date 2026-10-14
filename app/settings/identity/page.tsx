import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { availableIdentityRegions, availablePhoneRoutes, getMyPhoneStatus, listMyIdentityVerifications } from "../../../services/integrations";
import { IdentityStartButtons, PhoneVerificationForm } from "../../../components/settings/identity-verification";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  approved: { label: "Verified", tone: "text-success" },
  pending: { label: "In progress", tone: "text-warning" },
  declined: { label: "Not verified", tone: "text-danger" },
  expired: { label: "Expired -- start again", tone: "text-ink-muted" },
  error: { label: "Couldn't complete -- start again", tone: "text-danger" },
};

/** Automatic identity verification (hosted DigiLocker / document + selfie) and phone
 * verification, through whichever providers this deployment has configured. */
export default async function IdentitySettingsPage({ searchParams }: { searchParams: Promise<{ returned?: string }> }) {
  await requireResearcherSettings();
  const [verifications, phone, { returned }] = await Promise.all([listMyIdentityVerifications(), getMyPhoneStatus(), searchParams]);
  const regions = availableIdentityRegions();
  const phoneRoutes = availablePhoneRoutes();
  const latest = verifications[0];
  const verified = verifications.some((v) => v.status === "approved");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Identity &amp; phone</h1>
        <p className="mt-1 text-sm text-ink-muted">Some programs and every payout need a verified identity. Verification is done by a specialist provider; Unpatched only keeps the result.</p>
      </div>

      <section className="space-y-4">
        <SectionLabel>Identity</SectionLabel>
        {returned && latest?.status === "pending" && (
          <p role="status" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Thanks -- the provider is checking your documents. This page updates once they send the result.
          </p>
        )}
        {latest ? (
          <p className="text-sm">
            <span className={`font-semibold ${STATUS_COPY[latest.status].tone}`}>{STATUS_COPY[latest.status].label}</span>
            <span className="text-ink-muted">
              {" "}
              · started <LocalTime value={latest.createdAt} />
              {latest.failureReason ? ` · ${latest.failureReason}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">You haven&apos;t verified your identity yet.</p>
        )}
        {!verified &&
          (regions.length > 0 ? (
            <IdentityStartButtons regions={regions} />
          ) : (
            <p className="text-sm text-ink-muted">
              Automatic verification isn&apos;t switched on yet. You can submit your documents for manual review under{" "}
              <Link prefetch={false} href={"/settings/payments" as Route} className="font-medium text-action hover:text-action-hover">
                Rewards &amp; Payments
              </Link>
              .
            </p>
          ))}
      </section>

      <section className="space-y-4 border-t border-border pt-8">
        <SectionLabel>Phone</SectionLabel>
        {phone.verified ? (
          <p className="text-sm">
            <span className="font-semibold text-success">Verified</span>
            <span className="text-ink-muted">
              {" "}
              · {phone.countryCode} ••••{phone.last4}
            </span>
          </p>
        ) : phoneRoutes.india || phoneRoutes.global ? (
          <p className="text-sm text-ink-muted">We&apos;ll text you a one-time code. Standard message rates may apply.</p>
        ) : (
          <p className="text-sm text-ink-muted">Phone verification isn&apos;t available yet. It doesn&apos;t affect anything else on your account.</p>
        )}
        {(phoneRoutes.india || phoneRoutes.global) && <PhoneVerificationForm hasPending={Boolean(phone.pending)} routes={phoneRoutes} />}
      </section>
    </div>
  );
}
