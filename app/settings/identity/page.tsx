import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { requireResearcherSettings } from "../../../lib/auth/account-type";
import { availableIdentityRegions, availablePhoneRoutes, getMyPhoneStatus, listMyIdentityVerifications } from "../../../services/integrations";
import { IdentityStartButtons, PhoneVerificationForm } from "../../../components/settings/identity-verification";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { LocalTime } from "../../../components/ui/local-time";
import { KycSettings } from "../../../components/settings/kyc-settings";
import { TaxFormSettings } from "../../../components/settings/payout-details-settings";
import { getMyKycStatus, getMyPayoutDetails } from "../../../services/researcher-profiles";

// The shared verification vocabulary (Not started / Pending / Verified / Failed / Requires review).
// Only the provider's own result moves a check to Verified: starting it, or finishing the
// provider's steps, is Pending until their signed result arrives.
const STATUS_COPY: Record<string, { label: string; detail: string; tone: string }> = {
  approved: { label: "Verified", detail: "", tone: "text-success" },
  pending: { label: "Pending", detail: "Waiting for the provider's result.", tone: "text-warning" },
  declined: { label: "Failed", detail: "The provider could not verify you. You can try again.", tone: "text-danger" },
  expired: { label: "Failed", detail: "The session expired before it finished. Start again.", tone: "text-danger" },
  error: { label: "Failed", detail: "The provider had a problem. Start again.", tone: "text-danger" },
};

/** Automatic identity verification (hosted DigiLocker / document + selfie) and phone
 * verification, through whichever providers this deployment has configured. */
export default async function IdentitySettingsPage({ searchParams }: { searchParams: Promise<{ returned?: string }> }) {
  await requireResearcherSettings();
  const [verifications, phone, { returned }, kycStatus, payoutDetails] = await Promise.all([listMyIdentityVerifications(), getMyPhoneStatus(), searchParams, getMyKycStatus(), getMyPayoutDetails()]);
  const regions = availableIdentityRegions();
  const phoneRoutes = availablePhoneRoutes();
  const latest = verifications[0];
  const verified = verifications.some((v) => v.status === "approved");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Identity &amp; Tax</h1>
        <p className="mt-1 text-sm text-ink-muted">Submitting reports, some programs, and payouts need a verified identity. Verification is done by an authorized provider; Unpatched only keeps the result.</p>
      </div>

      <details className="rounded-lg border border-border bg-surface p-4 text-sm">
        <summary className="cursor-pointer font-semibold text-ink">Why we ask, and what we keep</summary>
        <div className="mt-3 space-y-2 text-ink-muted">
          <p>Verification keeps programs safe from throwaway and impersonating accounts, and lets us pay you and meet tax rules.</p>
          <p>
            In India, you verify Aadhaar and PAN in DigiLocker, the government&apos;s own service, through our provider. You approve the request and enter your OTP on DigiLocker&apos;s site.
            Unpatched never sees or stores your Aadhaar number, OTP, or documents.
          </p>
          <p>We keep only: which provider checked you, their reference for the check, the outcome and its date. Nothing about it appears on your public profile, your reports, or in URLs or analytics.</p>
          <p>
            A verification is valid for 12 months, then you verify again. These records are kept while your account exists; deactivating your account does not erase them. To ask for them to be
            erased, contact us through{" "}
            <Link prefetch={false} href={"/help" as Route} className="font-medium text-action hover:text-action-hover">
              Help
            </Link>
            .
          </p>
        </div>
      </details>

      <section className="space-y-4">
        <SectionLabel>Identity</SectionLabel>
        {returned && latest?.status === "pending" && (
          <p role="status" className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
            Thanks -- the provider is checking your documents. This page updates once they send the result.
          </p>
        )}
        {latest ? (
          <p className="text-sm" role="status">
            <span className={`font-semibold ${STATUS_COPY[latest.status].tone}`}>{STATUS_COPY[latest.status].label}</span>
            <span className="text-ink-muted">
              {" "}
              · started <LocalTime value={latest.createdAt} />
              {STATUS_COPY[latest.status].detail ? ` · ${STATUS_COPY[latest.status].detail}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-muted">
            <span className="font-semibold text-ink">Not started.</span> You haven&apos;t verified your identity yet.
          </p>
        )}
        {!verified &&
          (regions.length > 0 ? (
            <IdentityStartButtons regions={regions} />
          ) : (
            <p className="text-sm text-ink-muted">
              Automatic verification isn&apos;t switched on yet. You can submit your documents for manual review below.
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

      {/* PAN, Aadhaar, passport and mobile for manual review, and the tax form: identity and tax
          details live together here; Rewards & Payments keeps only where the money goes. */}
      <KycSettings initial={kycStatus} />
      <TaxFormSettings initial={payoutDetails} />
    </div>
  );
}
