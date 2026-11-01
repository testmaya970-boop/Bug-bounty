import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { AuthLayout } from "../../../components/auth/auth-layout";

/** Single sign-on (202610290006): the work email picks the organization through its verified
 * domain, then the person continues at their identity provider. A plain GET form, so it works
 * before JavaScript loads. */
export default async function SsoSignInPage({ searchParams }: { searchParams: Promise<{ sso_error?: string }> }) {
  const { sso_error: ssoError } = await searchParams;
  return (
    <AuthLayout eyebrow="Unpatched" title="Sign in with SSO" description="Use your organization's identity provider.">
      <form method="get" action="/api/sso/saml/start" className="space-y-3">
        <label htmlFor="sso-email" className="block text-[13px] font-medium text-ink">
          Work email
        </label>
        <input id="sso-email" name="email" type="email" required autoComplete="email" className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink" />
        {ssoError && (
          <p role="alert" className="text-sm font-medium text-danger">
            {ssoError.slice(0, 200)}
          </p>
        )}
        <button type="submit" className="min-h-11 w-full rounded-md bg-action px-3 text-sm font-medium text-on-action hover:bg-action-hover">
          Continue
        </button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link prefetch={false} href={"/sign-in" as Route} className="font-medium text-action hover:text-action-hover">
          Sign in with a password instead
        </Link>
      </p>
    </AuthLayout>
  );
}
