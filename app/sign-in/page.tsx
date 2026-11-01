import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AuthLayout } from "../../components/auth/auth-layout";
import { SignInForm } from "../../components/auth/sign-in-form";
import { getCurrentUser } from "../../lib/auth/current-user";
import { isSafeRedirect } from "../../lib/auth/safe-redirect";
import { determineDefaultDestination } from "../../lib/auth/default-destination";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string; error?: string; reset?: string }> }) {
  const { redirectTo, error, reset } = await searchParams;

  const user = await getCurrentUser();
  // Reuses signInAction's identical, real-relationship-derived destination logic, so an
  // already-authenticated visit to /sign-in and a fresh sign-in never disagree.
  if (user) redirect((isSafeRedirect(redirectTo) ? redirectTo : await determineDefaultDestination(user.id)) as Route);

  return (
    <AuthLayout eyebrow="Unpatched" title="Welcome back" description="Sign in to your security workspace.">
      {error === "confirmation_failed" && (
        <p role="alert" className="mb-4 text-sm font-medium text-danger">
          That confirmation link is invalid or has expired. Try signing in, or sign up again.
        </p>
      )}
      {reset === "success" && (
        <p role="status" className="mb-4 text-sm font-medium text-success">
          Your password has been updated. Sign in with your new password.
        </p>
      )}
      <SignInForm redirectTo={redirectTo} />
      {/* Single sign-on (202610290006) has its own page, so this form keeps one email field. */}
      <p className="mt-6 border-t border-border pt-4 text-center text-sm">
        <Link prefetch={false} href={"/sign-in/sso" as Route} className="font-medium text-action hover:text-action-hover">
          Sign in with SSO
        </Link>
      </p>
    </AuthLayout>
  );
}
