import React from "react";
import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { EmptyState } from "../../components/ui/feedback";
import { RegistryList, SectionLabel } from "../../components/ui/security-primitives";
import { Tabs, type TabItem } from "../../components/ui/tabs";
import { PendingProgramInvitationCard } from "../../components/programs/pending-program-invitation-card";
import { ProgramParticipationCard } from "../../components/programs/program-participation-card";
import { PublicProgramList } from "../../components/programs/public-program-list";
import { PublicProgramSearchForm } from "../../components/programs/public-program-search-form";
import { RecommendedProgramsList } from "../../components/programs/recommended-programs-list";
import { TopBountyProgramsList } from "../../components/programs/top-bounty-programs-list";
import { listMyPendingProgramInvitations, listMyProgramParticipations } from "../../services/program-researchers";
import { listPublicPrograms, listTopBountyPrograms } from "../../services/programs";
import { listRecommendedPrograms } from "../../services/researcher-profiles";
import { getCurrentUser } from "../../lib/auth/current-user";
import { FOCUS_AREA_ORDER } from "../../lib/researcher-identity-labels";
import type { ResearcherFocusArea } from "../../types/researcher-identity";

type ProgramsTab = "all" | "mine" | "invitations";
type ProgramsSearchParams = { tab?: string; q?: string; status?: string; focusArea?: string };

function parseTabParam(value: string | undefined): ProgramsTab {
  return value === "mine" || value === "invitations" ? value : "all";
}

function parseStatusParam(value: string | undefined): "active" | "paused" | undefined {
  return value === "active" || value === "paused" ? value : undefined;
}

function parseFocusAreaParam(value: string | undefined): ResearcherFocusArea | undefined {
  return value && (FOCUS_AREA_ORDER as string[]).includes(value) ? (value as ResearcherFocusArea) : undefined;
}

/**
 * The real public program registry (see docs/decisions/0041/0042/0056) -- search and
 * status filtering are applied server-side via list_public_programs itself, never
 * fetched-then-filtered here. A plain GET form: the URL is the only state, so
 * search -> reload -> identical results, and the filters survive a bookmark/share.
 */
async function AllProgramsTab({ searchParams }: { searchParams: ProgramsSearchParams }) {
  const status = parseStatusParam(searchParams.status);
  const focusArea = parseFocusAreaParam(searchParams.focusArea);
  const search = searchParams.q?.trim() || undefined;
  const [{ items: programs, nextCursor }, topBounty, recommended] = await Promise.all([
    listPublicPrograms({ search, status, focusArea }),
    listTopBountyPrograms(),
    listRecommendedPrograms(),
  ]);
  const isFiltered = Boolean(search || status || focusArea);

  return (
    <div className="space-y-8">
      <PublicProgramSearchForm tab="all" search={search} status={status} focusArea={focusArea} />

      {!isFiltered && topBounty.length > 0 && (
        <div className="space-y-3">
          <div>
            <SectionLabel>Real, configured payouts</SectionLabel>
            <h2 className="mt-1 text-lg font-semibold text-ink">Highest-paying programs</h2>
          </div>
          <TopBountyProgramsList programs={topBounty} />
        </div>
      )}

      {!isFiltered && recommended.length > 0 && (
        <div className="space-y-3">
          <div>
            <SectionLabel>Matched to your interests</SectionLabel>
            <h2 className="mt-1 text-lg font-semibold text-ink">Recommended for you</h2>
            <p className="mt-0.5 text-sm text-ink-muted">Public programs whose focus areas overlap what you set in Settings. A literal match, not a ranking.</p>
          </div>
          <RecommendedProgramsList programs={recommended} />
        </div>
      )}

      <div className="space-y-3">
        <div>
          <SectionLabel>Registry</SectionLabel>
          <h2 className="mt-1 text-lg font-semibold text-ink">{isFiltered ? "Results" : "Every public program"}</h2>
        </div>
        {programs.length === 0 ? (
          <EmptyState title={isFiltered ? "No matching public programs" : "No public programs right now"}>
            {isFiltered
              ? "No public program matches this search. Clear the filters or browse every available program."
              : "Organizations occasionally open a program to the whole community. Check back later, or ask an organization to invite you directly."}
          </EmptyState>
        ) : (
          <PublicProgramList initialPrograms={programs} initialNextCursor={nextCursor} search={search} status={status} focusArea={focusArea} />
        )}
      </div>
    </div>
  );
}

/** Only programs this researcher has a real, current row for in program_researchers --
 * never "programs that might interest you" dressed up as membership. See
 * docs/decisions/0056.
 *
 * Takes the already-fetched list as a prop rather than querying again -- the parent
 * fetches it once (for the tab's own badge count), so this would otherwise be a second,
 * wasted round-trip for the exact same rows. */
async function MyProgramsTab({ participationsRaw }: { participationsRaw: Awaited<ReturnType<typeof listMyProgramParticipations>> }) {
  // Active-first, so the programs a researcher can actually act on right now are never
  // buried below ones they currently cannot -- a pure re-sort of the same, already-fetched,
  // already self-scoped list.
  const participations = [...participationsRaw].sort((a, b) => (a.status === b.status ? 0 : a.status === "active" ? -1 : 1));

  if (participations.length === 0) {
    return (
      <EmptyState title="You don't participate in any program yet">
        A program manager invites researchers directly by email. If you were expecting an invitation, check{" "}
        <Link href="/programs?tab=invitations" className="font-medium text-action hover:underline">
          Pending invitations
        </Link>
        , or browse{" "}
        <Link href="/programs?tab=all" className="font-medium text-action hover:underline">
          All programs
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <RegistryList>
      {participations.map((participation) => (
        <ProgramParticipationCard key={participation.programId} participation={participation} />
      ))}
    </RegistryList>
  );
}

/** Every invitation here is a real row in program_invitations, sent by an organization
 * member through invite_researcher_to_program -- accept/decline call the same real RPCs
 * the token-based accept flow uses. See docs/decisions/0056.
 *
 * Takes the already-fetched list as a prop for the same reason MyProgramsTab does --
 * the parent already fetched it once for the tab's own badge count. */
function PendingInvitationsTab({ invitations }: { invitations: Awaited<ReturnType<typeof listMyPendingProgramInvitations>> }) {
  if (invitations.length === 0) {
    return <EmptyState title="No pending invitations">When an organization invites you to a program directly, it will show up here. Accept or decline before it expires.</EmptyState>;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {invitations.map((invitation) => (
        <PendingProgramInvitationCard key={invitation.id} invitation={invitation} />
      ))}
    </div>
  );
}

async function AnonymousProgramsPage({ searchParams }: { searchParams: ProgramsSearchParams }) {
  const status = parseStatusParam(searchParams.status);
  const focusArea = parseFocusAreaParam(searchParams.focusArea);
  const search = searchParams.q?.trim() || undefined;
  const isFiltered = Boolean(search || status || focusArea);
  const [{ items: programs, nextCursor }, topBounty] = await Promise.all([listPublicPrograms({ search, status, focusArea }), listTopBountyPrograms()]);
  const activeCount = programs.filter((program) => program.status === "active").length;

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="border-b border-border px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Unpatched
          </Link>
          <Link href="/sign-in" className="text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 motion-safe:animate-hero-reveal">
        {/* A real fact, not decoration: the exact active count from the same query the
            registry below renders, given visual weight instead of only appearing as a
            row count further down the page -- confirmed live as the actual gap on this
            page: a bare heading with nothing else to look at before the first list. */}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <SectionLabel>Registry · Open to the community</SectionLabel>
          {activeCount > 0 && <span className="font-mono text-xs font-semibold text-success">{activeCount} active now</span>}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Security research programs open to the community</h1>
        <p className="mt-2 text-sm text-ink-muted">Sign in (or create a researcher account) once you find a program that fits, to submit a report.</p>

        <div className="mt-8">
          <PublicProgramSearchForm search={search} status={status} focusArea={focusArea} />
        </div>

        {!isFiltered && topBounty.length > 0 && (
          <div className="mt-10 space-y-3">
            <div>
              <SectionLabel>Real, configured payouts</SectionLabel>
              <h2 className="mt-1 text-lg font-semibold text-ink">Highest-paying programs</h2>
            </div>
            <TopBountyProgramsList programs={topBounty} />
          </div>
        )}

        <div className="mt-10 space-y-3">
          <div>
            <SectionLabel>Registry</SectionLabel>
            <h2 className="mt-1 text-lg font-semibold text-ink">{isFiltered ? "Results" : "Every public program"}</h2>
          </div>
          {programs.length === 0 ? (
            <EmptyState title={isFiltered ? "No matching public programs" : "No public programs right now"}>
              {isFiltered
                ? "No public program matches this search. Clear the filters or browse every available program."
                : "Check back later, or ask an organization to invite you directly."}
            </EmptyState>
          ) : (
            <PublicProgramList initialPrograms={programs} initialNextCursor={nextCursor} search={search} status={status} focusArea={focusArea} />
          )}
        </div>
      </main>
      <footer className="border-t border-border px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
          <span>Unpatched</span>
          <Link href="/sign-in" className="font-medium hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<ProgramsSearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const user = await getCurrentUser();
  if (!user) return <AnonymousProgramsPage searchParams={resolvedSearchParams} />;

  const tab = parseTabParam(resolvedSearchParams.tab);

  // Badge counts need the same two lists "My Programs" and "Pending Invitations" display
  // in their own bodies -- fetched once here and threaded down as a prop, never
  // re-queried by the tab itself. Previously this ran unconditionally for every tab,
  // including "All Programs," which never displays this data at all -- a real, felt
  // latency tax on every click, since every tab click is a full navigation through
  // middleware's own auth gate. Fetching both lists always (rather than only the active
  // tab's) is the one deliberate compromise left: the tab bar itself needs both counts on
  // every render, since a researcher can see "My Programs (3)" while looking at "All
  // Programs." Each query is real and cheap (a single indexed RPC), unlike the
  // AllProgramsTab-only registry/top-bounty/recommended fetches, which now only ever run
  // when tab === "all".
  const [invitations, participations] = await Promise.all([listMyPendingProgramInvitations(), listMyProgramParticipations()]);

  const tabs: TabItem[] = [
    { key: "all", label: "All Programs", href: "/programs?tab=all" },
    { key: "mine", label: "My Programs", href: "/programs?tab=mine", count: participations.length },
    { key: "invitations", label: "Pending Invitations", href: "/programs?tab=invitations", count: invitations.length },
  ];

  return (
    <AppShell title="Programs" user={user}>
      <div className="space-y-6">
        <div>
          <SectionLabel>Registry</SectionLabel>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Programs</h1>
        </div>

        <Tabs items={tabs} active={tab} />

        <div>
          {tab === "all" && <AllProgramsTab searchParams={resolvedSearchParams} />}
          {tab === "mine" && <MyProgramsTab participationsRaw={participations} />}
          {tab === "invitations" && <PendingInvitationsTab invitations={invitations} />}
        </div>
      </div>
    </AppShell>
  );
}
