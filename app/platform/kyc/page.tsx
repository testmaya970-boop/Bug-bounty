import React from "react";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
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
 * non-admin gets a real 404, matching /platform/needs-recovery's own convention. Uses
 * <AppShell> like every other authenticated page -- see app/platform/programs/page.tsx's
 * own comment for why this replaced a separate header+nav-bar component.
 */
export default async function KycReviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/kyc" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const submissions = await listKycSubmissions();

  return (
    <AppShell title="KYC review" user={user}>
      <div className="max-w-5xl space-y-6">
        <SectionLabel>Platform operations</SectionLabel>
        <p className="text-sm text-ink-muted">Researcher-submitted Aadhaar/PAN/passport/phone details awaiting manual review. No automated verification exists: every decision here is a real, logged decision.</p>

        {submissions.length === 0 ? (
          <EmptyState title="No pending KYC submissions">Nothing is waiting on review right now.</EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
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
      </div>
    </AppShell>
  );
}
