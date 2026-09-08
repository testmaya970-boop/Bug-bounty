import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../../components/ui/navigation";
import { EmptyState, PermissionDenied } from "../../../../../../../components/ui/feedback";
import { SectionLabel } from "../../../../../../../components/ui/security-primitives";
import { CreateReportForm } from "../../../../../../../components/reports/create-report-form";
import { getProgram } from "../../../../../../../services/programs";
import { getMyParticipation } from "../../../../../../../services/program-researchers";
import { getCurrentUser } from "../../../../../../../lib/auth/current-user";

export default async function NewReportPage({ params }: { params: Promise<{ organizationId: string; programId: string }> }) {
  const { organizationId, programId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/reports/new` as Route);

  const program = await getProgram(programId);
  if (!program || program.organizationId !== organizationId) {
    return (
      <AppShell title="Report a vulnerability" user={user}>
        <PermissionDenied>This program does not exist, or you do not have access to it.</PermissionDenied>
      </AppShell>
    );
  }

  const participation = await getMyParticipation(user.id, programId);
  if (!participation || participation.status !== "active") {
    return (
      <AppShell title="Report a vulnerability" user={user}>
        <PermissionDenied>You are not currently an authorized, active researcher for this program.</PermissionDenied>
      </AppShell>
    );
  }

  if (program.status === "paused" || program.status === "closed") {
    return (
      <AppShell title="Report a vulnerability" user={user}>
        <EmptyState title="This program is not currently accepting reports">Its status is {program.status}. Check back later, or contact the program if you believe this is a mistake.</EmptyState>
      </AppShell>
    );
  }

  return (
    <AppShell title="Report a vulnerability" user={user}>
      <div className="mx-auto max-w-2xl space-y-6">
        <Breadcrumbs
          items={[
            { label: "Organizations", href: "/organizations" },
            { label: "Engagements", href: `/organizations/${organizationId}/programs` },
            { label: program.name, href: `/organizations/${organizationId}/programs/${programId}` },
            { label: "Report a vulnerability" },
          ]}
        />
        <div>
          <SectionLabel>Document a security finding</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Every field below becomes part of the report record. Nothing here is discarded on submission.</p>
        </div>
        <CreateReportForm organizationId={organizationId} programId={programId} programName={program.name} />
      </div>
    </AppShell>
  );
}
