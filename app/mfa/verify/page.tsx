import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AuthLayout } from "../../../components/auth/auth-layout";
import { MfaVerifyForm } from "../../../components/auth/mfa-verify-form";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { getMyMfaStatus, hasLiveMfaVerificationCode, listMyMfaFactors, requestMfaVerificationCode } from "../../../services/mfa";
import { activeEmailProvider } from "../../../lib/email-provider";
import { isSafeRedirect } from "../../../lib/auth/safe-redirect";

/**
 * The one route proxy.ts's MFA gate always allows through. If there's nothing to
 * verify (no enrolled factor, or this session already cleared it), there is no reason to
 * be here -- redirect straight to the real destination rather than showing a pointless
 * form. See docs/decisions/0052.
 */
export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}` as Route);

  const status = await getMyMfaStatus();
  if (!status.totpEnrolled || status.sessionVerified) {
    redirect((isSafeRedirect(redirectTo) ? redirectTo : "/") as Route);
  }

  const factors = await listMyMfaFactors();
  const verifiedFactor = factors.find((factor) => factor.status === "verified");
  if (!verifiedFactor) redirect((isSafeRedirect(redirectTo) ? redirectTo : "/") as Route);

  // Email method: send a code only if no usable one is out yet. Sending on every render
  // cancelled the code the person was holding each time they reloaded or retyped the address
  // (create_mfa_challenge invalidates the previous one), which made sign-in feel stuck. "Email
  // me a new code" in the form is the explicit way to get another. Authenticator: nothing to send.
  if (verifiedFactor.method === "email" && !(await hasLiveMfaVerificationCode())) await requestMfaVerificationCode();

  return (
    <AuthLayout eyebrow="Two-factor authentication" title="Verify it's you" description="This account has two-factor authentication enabled." variant="default">
      <MfaVerifyForm factorId={verifiedFactor.id} method={verifiedFactor.method} redirectTo={isSafeRedirect(redirectTo) ? redirectTo : undefined} emailIsSimulated={activeEmailProvider.name === "dev"} />
    </AuthLayout>
  );
}
