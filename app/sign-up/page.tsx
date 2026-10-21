import React from "react";
import { redirect } from "next/navigation";
import { AuthLayout } from "../../components/auth/auth-layout";
import { AudienceChoice } from "../../components/auth/audience-choice";
import { getCurrentUser } from "../../lib/auth/current-user";
import { isSafeRedirect } from "../../lib/auth/safe-redirect";

/**
 * A neutral fallback, not a form -- reached only from an old link/bookmark or the
 * sign-in page's own "Create an account" cross-link, since the real entry points are
 * /researchers/sign-up and /organizations/sign-up (chosen from the public homepage).
 * Asking "researcher or organization?" here, after the visitor already clicked a generic
 * "create an account" link, is exactly the once-removed version of the same choice the
 * homepage already offers -- so this page reuses the identical AudienceChoice, never a
 * second, drifting copy of it. See docs/decisions/0030-public-entry-and-two-sided-authentication.md.
 */
export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { redirectTo } = await searchParams;

  return (
    <AuthLayout eyebrow="Unpatched" title="Create your Unpatched account" description="Choose which side of Unpatched you're joining.">
      <AudienceChoice redirectTo={isSafeRedirect(redirectTo) ? redirectTo : undefined} />
    </AuthLayout>
  );
}
