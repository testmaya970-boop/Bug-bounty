import React from "react";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { SectionLabel } from "../../components/ui/security-primitives";
import { LocalTime } from "../../components/ui/local-time";
import { ActionButton } from "../../components/researcher/journey-controls";
import { MentorProfileForm, MentorshipRequestForm, MentorshipRespondForm } from "../../components/researcher/journey-forms";
import { JourneyStatus } from "../../components/researcher/journey-status";
import { getCurrentUser } from "../../lib/auth/current-user";
import { getSettingsAudience } from "../../lib/auth/account-type";
import { getMyMentorProfile, listMentors, listMyMentorships } from "../../services/researcher-journey";
import { closeMentorshipAction, respondMentorshipAction } from "../../actions/researcher-journey";

/** Mentorship between researchers (202610280001). Mentors are researchers with at least three
 * resolved reports who opt in. A mentor who accepts shares how and when to meet; the meeting
 * itself happens wherever they agree, outside this app. */
export default async function MentorshipPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/mentorship" as Route);
  if ((await getSettingsAudience()) !== "researcher") redirect("/" as Route);

  const [mentors, mine, profile] = await Promise.all([listMentors(), listMyMentorships(), getMyMentorProfile()]);
  const others = mentors.filter((m) => m.userId !== user.id);
  const asMentor = mine.filter((m) => m.myRole === "mentor");
  const asMentee = mine.filter((m) => m.myRole === "mentee");

  return (
    <AppShell title="Mentorship" user={user}>
      <div className="max-w-4xl space-y-10">
        {asMentor.some((m) => m.status === "pending") && (
          <section className="space-y-3">
            <SectionLabel>Requests for you</SectionLabel>
            <ul className="space-y-3">
              {asMentor
                .filter((m) => m.status === "pending")
                .map((m) => (
                  <li key={m.id} className="rounded-lg border border-border p-4">
                    <p className="text-sm font-medium text-ink">
                      {m.otherDisplayName} <span className="font-normal text-ink-muted">(@{m.otherUsername}) · {m.topic}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{m.message}</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <MentorshipRespondForm requestId={m.id} />
                      <ActionButton action={respondMentorshipAction.bind(null, m.id, false, "")}>Decline</ActionButton>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <SectionLabel>Find a mentor</SectionLabel>
          {others.length === 0 ? (
            <EmptyState title="No mentors yet">Experienced researchers can offer mentorship below. When they do, they appear here.</EmptyState>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {others.map((m) => {
                const open = m.myRequestStatus === "pending" || m.myRequestStatus === "accepted";
                return (
                  <li key={m.userId} className="min-w-0 rounded-lg border border-border p-4">
                    <p className="font-medium text-ink">
                      {m.displayName} <span className="text-sm font-normal text-ink-muted">@{m.username}</span>
                    </p>
                    <p className="mt-1 text-sm text-ink">{m.headline}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {m.resolvedReports} resolved reports · {m.topics.join(", ")}
                    </p>
                    <div className="mt-3">
                      {open ? (
                        <JourneyStatus status={m.myRequestStatus!} />
                      ) : !m.accepting || m.openSlots === 0 ? (
                        <p className="text-sm font-medium text-ink-muted">Not taking requests right now.</p>
                      ) : (
                        <details>
                          <summary className="cursor-pointer text-sm font-medium text-action">Ask for mentorship</summary>
                          <div className="mt-3">
                            <MentorshipRequestForm mentorId={m.userId} topics={m.topics} />
                          </div>
                        </details>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <SectionLabel>Your mentorships</SectionLabel>
          {mine.filter((m) => m.status !== "pending" || m.myRole === "mentee").length === 0 ? (
            <p className="text-sm text-ink-muted">None yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {[...asMentee, ...asMentor.filter((m) => m.status !== "pending")].map((m) => (
                <li key={m.id} className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink">
                        {m.myRole === "mentee" ? "Mentor" : "Mentee"}: {m.otherDisplayName}
                      </span>
                      <JourneyStatus status={m.status} />
                    </div>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {m.topic} · <LocalTime value={m.createdAt} dateOnly />
                    </p>
                    {m.mentorNote && m.status === "accepted" && <p className="mt-1 whitespace-pre-wrap text-sm text-ink">How to meet: {m.mentorNote}</p>}
                  </div>
                  <div className="flex gap-2">
                    {m.status === "accepted" && <ActionButton action={closeMentorshipAction.bind(null, m.id, "completed")}>Mark completed</ActionButton>}
                    {(m.status === "accepted" || (m.status === "pending" && m.myRole === "mentee")) && (
                      <ActionButton variant="quiet" action={closeMentorshipAction.bind(null, m.id, "cancelled")} confirm="This ends the mentorship request." confirmLabel="Cancel mentorship?">
                        Cancel
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <SectionLabel>Mentor others</SectionLabel>
          <p className="text-sm text-ink-muted">Open to researchers with at least three resolved reports. You choose your topics and how many people you take on.</p>
          <MentorProfileForm initial={profile} />
        </section>
      </div>
    </AppShell>
  );
}
