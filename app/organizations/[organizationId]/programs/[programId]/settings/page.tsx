import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../../../../components/app-shell";
import { Breadcrumbs } from "../../../../../../components/ui/navigation";
import { PermissionDenied } from "../../../../../../components/ui/feedback";
import { ProgramHeader } from "../../../../../../components/programs/program-header";
import { ProgramLifecycleControls } from "../../../../../../components/programs/program-lifecycle-controls";
import { ProgramTeamPanel } from "../../../../../../components/programs/program-team-panel";
import { ProgramVisibilityPanel } from "../../../../../../components/programs/program-visibility-panel";
import { ProgramKycPanel } from "../../../../../../components/programs/program-kyc-panel";
import { ProgramTrackRecordPanel } from "../../../../../../components/programs/program-track-record-panel";
import { JoinModePanel } from "../../../../../../components/programs/program-access-request";
import { ProgramAccessInstructionsEditor } from "../../../../../../components/programs/program-access-instructions-panel";
import { ProgramAccessFileEditor } from "../../../../../../components/programs/program-access-file-panel";
import { ProgramFocusAreasPanel } from "../../../../../../components/programs/program-focus-areas-panel";
import { canCreateProgram } from "../../../../../../services/authorization";
import { getActorMembership, listOrganizationMembers } from "../../../../../../services/organization-members";
import { getProgram, getProgramAccessInstructions, getProgramFocusAreas, listProgramMembers, listProgramsForOrganization } from "../../../../../../services/programs";
import { getProgramAccessFile } from "../../../../../../services/program-access-file";
import { getCurrentUser } from "../../../../../../lib/auth/current-user";

/** One setting: a short title, one line of what it does, then the control. */
function Setting({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-16 grid-cols-1 gap-4 border-b border-border py-6 last:border-0 md:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}

/**
 * Program settings (Oct 23): everything a manager changes about a program, out of the
 * Overview -- status, team, visibility, who can join and abuse protection, identity checks,
 * access instructions and the VPN/setup file, recommendations. Same controls and the same
 * database checks as before; only their place changed.
 */
export default async function ProgramSettingsPage({ params }: { params: Promise<{ organizationId: string; programId: string }> }) {
  const { organizationId, programId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirectTo=/organizations/${organizationId}/programs/${programId}/settings` as Route);

  const [program, members, actorMembership] = await Promise.all([getProgram(programId), listProgramMembers(programId), getActorMembership(user.id, organizationId)]);
  const isProgramManager = members.some((m) => m.userId === user.id && m.role === "manager");
  const isOrgAdmin = Boolean(actorMembership && actorMembership.status === "active" && canCreateProgram(actorMembership.role));
  if (!program || program.organizationId !== organizationId || !(isProgramManager || isOrgAdmin)) {
    return (
      <AppShell title="Program settings" user={user} organizationId={organizationId}>
        <PermissionDenied>Only an organization owner, security admin or this program&apos;s manager can change its settings.</PermissionDenied>
      </AppShell>
    );
  }

  const [accessInstructions, accessFile, focusAreas, organizationMembers, organizationPrograms] = await Promise.all([
    getProgramAccessInstructions(programId),
    getProgramAccessFile(programId),
    getProgramFocusAreas(programId),
    isOrgAdmin ? listOrganizationMembers(organizationId) : Promise.resolve([]),
    listProgramsForOrganization(organizationId),
  ]);
  const isPublic = program.visibility === "public";

  return (
    <AppShell title="Program settings" user={user} organizationId={organizationId}>
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: "Organizations", href: "/organizations" }, { label: "Engagements", href: `/organizations/${organizationId}/programs` }, { label: program.name, href: `/organizations/${organizationId}/programs/${programId}` }, { label: "Settings" }]} />
        <ProgramHeader
          organizationId={organizationId}
          programId={programId}
          programName={program.name}
          status={program.status}
          programType={program.programType}
          active="settings"
          canManage
          canWorkReports
          siblingPrograms={organizationPrograms.filter((p) => p.id !== programId).map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        />

        <div className="max-w-5xl">
          <Setting title="Status" description="Pause to stop new reports for a while. Closing is permanent.">
            <ProgramLifecycleControls organizationId={organizationId} programId={programId} status={program.status} />
            {program.status === "review" && <p className="text-[13px] text-ink-muted">Waiting for Unpatched to review the launch.</p>}
            {program.status === "suspended" && <p className="text-[13px] font-medium text-danger">Suspended by Unpatched. Contact support to reinstate it.</p>}
          </Setting>

          {isOrgAdmin && (
            <Setting title="Team" description="Program managers and triagers assigned to this program.">
              <ProgramTeamPanel
                organizationId={organizationId}
                programId={programId}
                members={members.filter((pm) => organizationMembers.some((m) => m.userId === pm.userId && (m.role === "program_manager" || m.role === "triager")))}
                candidates={organizationMembers
                  .filter((m) => m.status === "active" && (m.role === "program_manager" || m.role === "triager") && !members.some((pm) => pm.userId === m.userId))
                  .map((m) => ({ userId: m.userId, displayName: m.displayName, email: m.email, role: m.role as "program_manager" | "triager" }))}
              />
            </Setting>
          )}

          <Setting title="Visibility" description="Private: invited researchers only. Public: anyone on Unpatched can find and join it.">
            <ProgramVisibilityPanel organizationId={organizationId} programId={programId} visibility={program.visibility} description={program.description} />
          </Setting>

          <Setting id="abuse" title="Who can join and report" description="Approve each researcher, or ask for a proven record to keep out low-quality and abusive reports.">
            <JoinModePanel organizationId={organizationId} programId={programId} joinMode={program.joinMode ?? "open"} />
            <ProgramTrackRecordPanel organizationId={organizationId} programId={programId} minSignal={program.minSignal ?? null} minValidReports={program.minValidReports ?? null} />
          </Setting>

          <Setting title="Identity check for payouts" description="Every researcher verifies their identity before reporting. Turn this on to also require it before joining.">
            <ProgramKycPanel organizationId={organizationId} programId={programId} requiresKyc={program.requiresKyc} />
          </Setting>

          <Setting id="access" title="Access instructions and files" description={isPublic ? "Hidden while the program is public." : "VPN setup or credentials, shown only to researchers you've let in."}>
            <ProgramAccessInstructionsEditor organizationId={organizationId} programId={programId} accessInstructions={accessInstructions} />
            <ProgramAccessFileEditor organizationId={organizationId} programId={programId} file={accessFile} />
          </Setting>

          <Setting title="Recommendations" description="Tag the program so matching researchers see it.">
            <ProgramFocusAreasPanel organizationId={organizationId} programId={programId} focusAreas={focusAreas} />
          </Setting>
        </div>
      </div>
    </AppShell>
  );
}
