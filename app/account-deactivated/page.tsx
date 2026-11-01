import React from "react";
import { SignOutForm } from "../../components/auth/sign-out-form";

/**
 * Reached only by middleware's own am_i_deactivated() check (docs/decisions/0055) --
 * never a page a still-active account can navigate to directly. No self-serve
 * reactivation exists; disclosed, not implied. Also reached after a platform admin deactivates
 * an account (202610010001), so the copy covers both; admins can reactivate (202610090001).
 */
export default function AccountDeactivatedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight">Your account is deactivated</h1>
        <p className="mt-3 text-sm text-ink-muted">This account was deactivated, either by you from Settings or by the Unpatched team, and every session was signed out. You can't reactivate it yourself: contact support and the team can restore it if it wasn't permanently deleted.</p>
        <div className="mt-6">
          <SignOutForm buttonClassName="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-canvas hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
        </div>
      </div>
    </div>
  );
}
