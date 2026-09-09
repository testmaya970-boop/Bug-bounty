import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { SectionLabel } from "../../components/ui/security-primitives";
import { HaiWaitlistForm } from "../../components/hai/hai-waitlist-form";
import { amIOnHaiWaitlist } from "../../services/hai";
import { getCurrentUser } from "../../lib/auth/current-user";

/**
 * Hai (Turn 6/phase-9-ia): item 15 of the 15-point nav map, an honest stub. This product's
 * proposed AI co-pilot is genuinely in design -- no model, no chat, nothing that responds.
 * The one real thing here is the waitlist itself (public.hai_waitlist_entries, a real
 * persisted signup, not a fake "you're in!" over nothing). See CHANGELOG.md/docs/decisions
 * for anything that has actually shipped -- this page makes no claim beyond "we're
 * building this."
 */
export default async function HaiPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/hai" as Route);

  const alreadyOnWaitlist = await amIOnHaiWaitlist();

  return (
    <AppShell title="Hai" user={user}>
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <SectionLabel>In design</SectionLabel>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Hai, a co-pilot for triage</h2>
          <p className="mt-3 text-sm text-ink-muted">
            We're designing an AI co-pilot to help with the parts of triage that repeat -- duplicate detection, severity suggestions, first-pass write-ups. Nothing is built yet: no
            model, no chat, no responses. This page exists to be honest about that, not to preview a feature that doesn't exist.
          </p>
        </div>
        <HaiWaitlistForm alreadyOn={alreadyOnWaitlist} />
      </div>
    </AppShell>
  );
}
