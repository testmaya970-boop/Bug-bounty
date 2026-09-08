import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { KycReviewRow } from "../../../components/platform/kyc-review-row";
import { isPlatformAdmin } from "../../../services/platform-operations";
import { listKycSubmissions } from "../../../services/researcher-profiles";
import { getCurrentUser } from "../../../lib/auth/current-user";

/**
 * Platform-admin-only KYC review queue -- the other half of the "no fake verification
 * button" decision (docs/decisions/0051): a researcher submits an encrypted value, and a
 * real person here marks it verified/rejected after their own out-of-band review. A
 * non-admin gets a real 404, matching /platform/needs-recovery's own convention.
 */
export default async function KycReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/kyc" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const submissions = await listKycSubmissions();

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Unpatched</span>
          <span className="border-l border-border-strong pl-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Platform operations</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <SectionLabel>Platform operations</SectionLabel>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">KYC review</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">Researcher-submitted Aadhaar/PAN/passport/phone details awaiting manual review. No automated verification exists: every decision here is a real, logged decision.</p>

        {submissions.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="No pending KYC submissions">Nothing is waiting on review right now.</EmptyState>
          </div>
        ) : (
          <ul className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface">
            {submissions.map((submission) => (
              <KycReviewRow
                key={submission.userId}
                userId={submission.userId}
                displayName={submission.displayName}
                email={submission.email}
                statuses={{ phone: submission.phoneStatus, aadhaar: submission.aadhaarStatus, pan: submission.panStatus, passport: submission.passportStatus }}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
