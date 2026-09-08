import React from "react";
import { signOutAction } from "../../actions/auth";

/**
 * Reached only by middleware's own am_i_deactivated() check (docs/decisions/0055) --
 * never a page a still-active account can navigate to directly. No self-serve
 * reactivation exists; disclosed, not implied.
 */
export default function AccountDeactivatedPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4 text-ink">
      <div className="max-w-sm text-center">
        <h1 className="text-xl font-semibold tracking-tight">Your account is deactivated</h1>
        <p className="mt-3 text-sm text-ink-muted">You deactivated this account from Settings. Every session was signed out at that moment. There is no self-serve reactivation yet. Contact support if you'd like this account reactivated.</p>
        <form action={signOutAction} className="mt-6">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-md bg-ink px-5 text-sm font-semibold text-canvas hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
