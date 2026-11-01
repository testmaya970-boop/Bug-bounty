import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AuthLayout } from "../../../../components/auth/auth-layout";
import { AcceptAnalystInvitation, JoinAsAnalystForm } from "../../../../components/managed-triage/join-forms";
import { getCurrentUser } from "../../../../lib/auth/current-user";

/** The link in a Managed Triage analyst invitation (202610290011). The token is checked when the
 * person acts (create account or accept), never displayed back or used to look anything up here. */
export default async function JoinAsAnalystPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  return (
    <AuthLayout
      eyebrow="Unpatched Managed Triage"
      title="Join as a triage analyst"
      description="You'll validate and triage security reports for organizations that use Managed Triage. Two-factor authentication is required before the queue opens."
    >
      {user ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Signed in as <span className="font-medium text-ink">{user.email}</span>. This must be the email the invitation was sent to.
          </p>
          <AcceptAnalystInvitation token={token} />
        </div>
      ) : (
        <div className="space-y-5">
          <JoinAsAnalystForm token={token} />
          <p className="text-center text-sm text-ink-muted">
            Already have an Unpatched account with this email?{" "}
            <Link prefetch={false} href={`/sign-in?redirectTo=/triage/join/${encodeURIComponent(token)}` as Route} className="font-medium text-action hover:text-action-hover">
              Sign in
            </Link>
          </p>
        </div>
      )}
    </AuthLayout>
  );
}
