import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/form";
import { DifficultyBadge, SeverityBadge, StatusBadge } from "../../components/ui/badge";
import { AppShellClient } from "../../components/app-shell-client";
import type { OrganizationSummary } from "../../services/organizations";

// AppShellClient's own OrganizationSwitcher calls useRouter() (docs/decisions/0075) --
// static rendering has no mounted app router, so this needs the same mock every other
// client-component test in this suite already uses for useRouter (e.g.
// triage-actions-ui.test.tsx), plus usePathname since AppShellClient itself calls that
// too for active-link highlighting.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }), usePathname: () => "/" }));

// AppShell itself (components/app-shell.tsx) is now a thin async Server Component that
// decides `organizations`/`hasResearcherParticipation` from real relationship data
// before rendering AppShellClient -- see services/organizations.ts's
// listCurrentUserOrganizations, services/program-researchers.ts's
// listMyProgramParticipations, and docs/decisions/0030 (no persistent role column exists
// or should exist; context is derived live on every render). An async Server Component
// cannot be rendered via renderToStaticMarkup at all, so these tests exercise the real,
// synchronously-renderable client component directly, the same "test the actual testable
// unit" convention this suite already uses elsewhere.
const ONE_ORG: OrganizationSummary[] = [{ id: "org-1", slug: "acme-security", name: "Acme Security", role: "owner", status: "active" }];
const NO_ORGS: OrganizationSummary[] = [];

describe("Unpatched UI foundation", () => {
  it("renders semantic button state and pending feedback", () => { const html = renderToStaticMarkup(<Button pending>Save changes</Button>); expect(html).toContain("disabled"); expect(html).toContain("Save changes"); expect(html).toContain("bg-action"); });
  it("renders distinct text status and severity badges", () => { const html = renderToStaticMarkup(<><StatusBadge status="needs_information" /><SeverityBadge severity="critical" /></>); expect(html).toContain("Needs Information"); expect(html).toContain("Critical"); expect(html).toContain("text-warning"); expect(html).toContain("text-severity-critical"); });
  it("never reuses report severity/status colors for CTF difficulty -- a practice challenge is not a real security signal", () => {
    const html = renderToStaticMarkup(<><DifficultyBadge difficulty="Insane" /><DifficultyBadge difficulty="Hard" /><DifficultyBadge difficulty="Medium" /><DifficultyBadge difficulty="Easy" /></>);
    expect(html).not.toMatch(/text-severity-critical|text-severity-high|text-success|text-warning|text-danger/);
    expect(html).toContain("text-accent-2");
  });
  it("associates form labels, help, and validation errors", () => { const html = renderToStaticMarkup(<Input id="title" label="Report title" helperText="Use a concise summary." error="A title is required." required />); expect(html).toContain('for="title"'); expect(html).toContain('aria-describedby="title-help title-error"'); expect(html).toContain('role="alert"'); });
  it("includes responsive navigation structure and a skip link", () => { const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={ONE_ORG} currentOrganizationId="org-1" hasResearcherParticipation={true} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>); expect(html).toContain("Skip to content"); expect(html).toContain("lg:hidden"); expect(html).toContain('aria-label="Primary navigation"'); });
  it("both-context (real org membership AND real researcher participation) shows Research/Practice/Record and the org zones together, never one replacing the other -- with exactly one Researchers entry and no separate Workspace group (both were found live to duplicate the same destinations under a second label, each producing the identical 'two nav items light up active at once' bug, see docs/decisions/0059)", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={ONE_ORG} currentOrganizationId="org-1" hasResearcherParticipation={true} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>);
    expect(html).toContain("Research");
    expect(html).toContain("Practice");
    expect(html).toContain("Record");
    expect(html).not.toContain("Workspace");
    expect(html).toContain("System");
    expect(html).toContain("Security");
    expect(html).toContain("Insights");
    expect(html).toContain(">Researchers<");
    expect(html).not.toContain(">Leaderboard<");
    expect(html).not.toContain(">My Programs<");
    expect(html).not.toContain(">Saved Programs<");
  });
  it("hides the org zones and the switcher entirely for a user with no organization membership; a signed-in user still gets a real account menu (Settings lives inside it -- see docs/decisions/0049), which renderToStaticMarkup can only observe in its closed state, since DropdownMenu's items mount on client-side open state, not in the initial static markup", () => {
    const html = renderToStaticMarkup(
      <AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={true} unreadNotificationCount={0} isPlatformAdmin={false} user={{ displayName: "Riley Researcher", email: "riley@example.com" }}>
        <p>Content</p>
      </AppShellClient>,
    );
    expect(html).toContain("Research");
    expect(html).not.toContain("Acme Security");
    expect(html).not.toContain("Switch organization");
    expect(html).toContain("Riley Researcher avatar");
    expect(html).toContain("Account menu");
    // A disclosure of links, not an ARIA menu (it has no menuitems): see DropdownMenu.
    expect(html).not.toContain('aria-haspopup="menu"');
  });
  it("organization-only (real org membership, zero researcher participation) hides the Research/Practice/Record zones entirely -- an org owner must never see researcher-only destinations like CTF/Learn/Bounties/the researcher dashboard, and the real organization switcher/nav zones render instead", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={ONE_ORG} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>);
    // "Research" alone would false-positive on the Security zone's own real "Researchers"
    // nav item -- assert against the zone label text ">Research<" (an exact nav-group
    // label match) instead of the bare substring.
    expect(html).not.toContain(">Research<");
    expect(html).not.toContain(">Practice<");
    expect(html).not.toMatch(/>CTF<|>Learn<|>Bounties</);
    expect(html).toContain("Acme Security");
    expect(html).toContain("Security");
    expect(html).toContain("Insights");
    expect(html).toContain("System");
  });
  it("organization-only with no currentOrganizationId (a non-org-scoped page) still resolves the nav zones against the user's one real organization, rather than showing the switcher with no destinations below it", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={ONE_ORG} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>);
    expect(html).toContain(`/organizations/${ONE_ORG[0].id}`);
  });
  it("neither yet (a brand-new signup, no org and no participation) keeps Research/Practice/Record so a new user can still discover public programs -- no invented onboarding flow", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>);
    expect(html).toContain("Research");
    expect(html).toContain("Practice");
    expect(html).not.toContain("Acme Security");
  });
  it("shows the Platform admin nav entry only for a real platform admin -- confirmed live as a genuine gap: platform_admins membership granted directly in the DB produced zero nav indication of admin status, only reachable by typing /platform/programs by hand", () => {
    const adminHtml = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={true}><p>Content</p></AppShellClient>);
    expect(adminHtml).toContain("Platform admin");
    expect(adminHtml).toContain('href="/platform/programs"');

    const nonAdminHtml = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={false}><p>Content</p></AppShellClient>);
    expect(nonAdminHtml).not.toContain("Platform admin");
    expect(nonAdminHtml).not.toContain('href="/platform/programs"');
  });
  it("hides Research/Practice/Record for a platform-admin-only account (no organizations, no real researcher participation) -- confirmed live as a genuine gap: an admin account fell through to the same 'brand-new signup' case as a real new user, and saw Dashboard/Programs/Reports/CTF/Learn/Bounties, none of it real or relevant to what a platform admin actually does", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={false} unreadNotificationCount={0} isPlatformAdmin={true}><p>Content</p></AppShellClient>);
    expect(html).not.toContain(">Research<");
    expect(html).not.toContain(">Practice<");
    expect(html).not.toMatch(/>CTF<|>Learn<|>Bounties</);
    expect(html).toContain("Platform admin");
  });
  it("still shows Research/Practice/Record for an account that is BOTH a platform admin AND a real researcher -- admin status alone must never erase a real relationship this account actually has", () => {
    const html = renderToStaticMarkup(<AppShellClient title="Foundation" organizations={NO_ORGS} hasResearcherParticipation={true} unreadNotificationCount={0} isPlatformAdmin={true}><p>Content</p></AppShellClient>);
    expect(html).toContain(">Research<");
    expect(html).toContain(">Practice<");
    expect(html).toContain("Platform admin");
  });
});
