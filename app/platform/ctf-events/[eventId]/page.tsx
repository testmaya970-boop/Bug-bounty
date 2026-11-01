import React from "react";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { AppShell } from "../../../../components/app-shell";
import { Breadcrumbs } from "../../../../components/ui/navigation";
import { SectionLabel } from "../../../../components/ui/security-primitives";
import { Card } from "../../../../components/ui/feedback";
import { CtfEventEditForm } from "../../../../components/platform/ctf-event-edit-form";
import { isPlatformAdmin } from "../../../../services/platform-operations";
import { getCtfEventForAdmin } from "../../../../services/ctf-events";
import { getCurrentUser } from "../../../../lib/auth/current-user";
import { MOCK_CTF_CHALLENGES } from "../../../../lib/mock/ctf";

/** Edit one event: its fields and its challenge set. Admin-gated like every /platform/* page
 * (the RPCs re-check server-side too). */
export default async function PlatformCtfEventEditPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/platform/ctf-events/${eventId}` as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const event = await getCtfEventForAdmin(eventId);
  if (!event) notFound();

  return (
    <AppShell title="Edit CTF event" user={user}>
      <div className="max-w-4xl space-y-6">
        <Breadcrumbs items={[{ label: "Platform", href: "/platform/ctf-events" }, { label: "CTF events", href: "/platform/ctf-events" }, { label: event.name }]} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <SectionLabel>Platform operations</SectionLabel>
            <h2 className="mt-1 text-lg font-semibold text-ink">{event.name}</h2>
            <p className="font-mono text-[11px] text-ink-muted">@{event.slug}</p>
          </div>
          {event.status !== "draft" && (
            <Link href={`/ctf/events/${event.slug}` as Route} className="text-sm font-medium text-action underline-offset-4 hover:underline">
              View public page →
            </Link>
          )}
        </div>

        <Card className="p-5 sm:p-6">
          <CtfEventEditForm event={event} allChallenges={MOCK_CTF_CHALLENGES} />
        </Card>
      </div>
    </AppShell>
  );
}
