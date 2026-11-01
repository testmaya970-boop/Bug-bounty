import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getSettingsAudience } from "../../lib/auth/account-type";
import { getMyMfaStatus } from "../../services/mfa";
import { isMyIdentityVerified } from "../../services/submission-signal";

/**
 * /settings: the private side of the account at a glance (how you sign in, how it is
 * protected, whether your identity is verified). It used to redirect to /settings/profile,
 * which made "Profile" and "Settings" open the same page; the public identity now lives at
 * /profile. The settings nav beside this page is the one way into each section, so this page
 * shows state, not a second list of links -- only a status that needs action carries one.
 */
const actionClass = "text-sm font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

function Row({ label, value, action }: { label: string; value: React.ReactNode; action?: { href: Route; label: string } }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-4">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="flex flex-wrap items-baseline gap-x-3 text-sm font-medium text-ink">
        {value}
        {action && (
          <Link prefetch={false} href={action.href} className={actionClass}>
            {action.label}
          </Link>
        )}
      </dd>
    </div>
  );
}

export default async function SettingsOverviewPage() {
  const user = await getCurrentUser();
  if (!user) return null; // the layout redirects; this only narrows the type.
  const audience = await getSettingsAudience();
  const [mfa, identityVerified] = await Promise.all([getMyMfaStatus(), audience === "researcher" ? isMyIdentityVerified() : Promise.resolve(null)]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Private to you. How others see you is on your{" "}
          <Link prefetch={false} href={"/profile" as Route} className="font-medium text-action hover:text-action-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            profile
          </Link>
          .
        </p>
      </div>

      <dl className="divide-y divide-border border-y border-border">
        <Row label="Signed in as" value={user.email ?? "No email on file"} />
        <Row label="Account type" value={audience === "organization" ? "Organization" : audience === "platform_admin" ? "Platform staff" : "Researcher"} />
        <Row
          label="Two-factor authentication"
          value={mfa.totpEnrolled ? `On${mfa.remainingBackupCodes > 0 ? `, ${mfa.remainingBackupCodes} backup codes left` : ", no backup codes left"}` : "Off"}
          action={!mfa.totpEnrolled ? { href: "/settings/security" as Route, label: "Turn on" } : mfa.remainingBackupCodes === 0 ? { href: "/settings/security" as Route, label: "Create backup codes" } : undefined}
        />
        {identityVerified !== null && (
          <Row
            label="Identity"
            value={identityVerified ? "Verified" : "Not verified, required before you can submit reports"}
            action={identityVerified ? undefined : { href: "/settings/identity" as Route, label: "Verify" }}
          />
        )}
      </dl>
    </div>
  );
}
