"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ShieldCheck,
  Target,
  FileWarning,
  Award,
  Trophy,
  FolderKanban,
  Bug,
  Swords,
  BookOpen,
  Bell,
  HelpCircle,
  Sparkles,
  Wand2,
  Activity,
  Landmark,
  Building2,
  UserCog,
  IdCard,
  Scale,
  RefreshCw,
  LifeBuoy,
  Search,
  Menu,
  X,
  ChevronsUpDown,
  Check,
  Plus,
} from "lucide-react";
import { Avatar, DropdownMenu } from "./ui/navigation";
import { IconButton } from "./ui/button";
import { Separator } from "./ui/feedback";
import { NotificationBellDropdown } from "./notifications/notification-bell-dropdown";
import { cn } from "../lib/cn";
import { usePrefersReducedMotion } from "../lib/motion";
import { signOutAction } from "../actions/auth";
import { MOCK_CTF_CHALLENGES } from "../lib/mock/ctf";
import { TRAINING_ARTICLES } from "../lib/training/content";
import { MOCK_TOTAL_RESEARCHERS } from "../lib/mock/researcher-dashboard";
import type { OrganizationSummary } from "../services/organizations";

// Every <Link> in this file carries prefetch={false}: this shell renders on every
// authenticated page, so its nav/switcher/menu links are on-screen (and thus
// speculatively prefetched by the App Router) on every single request. Each prefetch is
// a full middleware invocation through the deliberately unconditional deactivated/MFA
// gate (lib/session/middleware.ts) -- measured live at ~11x the real navigation volume.
// Disabling prefetch here removes that request volume at the source; the gate itself
// stays unconditional with no header-based exception (a prior attempt at exactly that
// was reverted -- Sec-Fetch-Mode is a client-controlled signal for any raw HTTP client,
// which is precisely the threat the gate exists to catch).
type NavItem = { href: Route; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string };

// docs/decisions/0074 -- the security-operating-system nav grouping. Same real
// destinations as before (no href changed, no route added/removed -- this is a visual/
// grouping pass only), reorganized into four labeled zones instead of one flat "Main"
// list, so the sidebar itself communicates "research work" vs. "practice/growth" vs.
// "the verified record" vs. "system," rather than one undifferentiated stack of icons.
//
// "Bounties" points at its own real, dedicated route (app/bounties/page.tsx) -- a
// researcher's bounty track record (summary + full ledger), not the /settings/payments
// stopgap this entry originally used. /settings/payments still exists as its own Settings
// subpage over the identical real data.
//
// Deliberately no separate "Leaderboard" entry: the real leaderboard (docs/decisions/0065)
// already lives inside /researchers alongside the reputation record -- one page, not two.
// Deliberately no separate "Workspace" group: found live to duplicate this same set of
// destinations under a second label (docs/decisions/0059) -- never reintroduced.
const RESEARCH_NAV: NavItem[] = [
  { href: "/" as Route, label: "Dashboard", icon: LayoutDashboard },
  { href: "/programs" as Route, label: "Programs", icon: FolderKanban },
  { href: "/reports" as Route, label: "Reports", icon: FileWarning },
  { href: "/researchers" as Route, label: "Researchers", icon: Trophy, badge: MOCK_TOTAL_RESEARCHERS.toLocaleString("en-US") },
];

const PRACTICE_NAV: NavItem[] = [
  { href: "/ctf" as Route, label: "CTF", icon: Swords, badge: MOCK_CTF_CHALLENGES.length.toString() },
  { href: "/learn" as Route, label: "Learn", icon: BookOpen, badge: TRAINING_ARTICLES.length.toString() },
];

const RECORD_NAV: NavItem[] = [{ href: "/bounties" as Route, label: "Bounties", icon: Award }];

// Platform-admin nav -- all seven app/platform/* destinations, which otherwise have zero
// nav visibility anywhere (confirmed live: platform_admins membership was granted directly
// in the DB, and the signed-in shell showed no indication of admin status at all, no link,
// nothing beyond typing a /platform/* URL by hand). Every /platform/* page still
// independently re-checks isPlatformAdmin() itself server-side -- this group rendering is
// a discoverability fix only, never the actual authorization boundary. An earlier pass
// gave these seven pages their own separate header+nav-bar component instead of using
// AppShell's sidebar like every other authenticated page -- flagged live as a real
// inconsistency and reverted; this group is the one, real, shared nav for all seven now.
const PLATFORM_NAV: NavItem[] = [
  { href: "/platform/programs" as Route, label: "Program launches", icon: Landmark },
  { href: "/platform/organizations" as Route, label: "Organizations", icon: Building2 },
  { href: "/platform/researchers" as Route, label: "Researchers", icon: UserCog },
  { href: "/platform/kyc" as Route, label: "KYC", icon: IdCard },
  { href: "/platform/mediations" as Route, label: "Mediations", icon: Scale },
  { href: "/platform/retests" as Route, label: "Retests", icon: RefreshCw },
  { href: "/platform/needs-recovery" as Route, label: "Needs recovery", icon: LifeBuoy },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/notifications" as Route, label: "Notifications", icon: Bell },
  // A real, honest static stub -- not a fabricated feature preview. See
  // app/coming-soon/page.tsx's own comment for why this exists as a real destination
  // rather than a dead link (matches HackerOne's own reference nav, which documents
  // "Coming Soon" as its own destination).
  { href: "/coming-soon" as Route, label: "Coming Soon", icon: Sparkles },
  // Item 15 of the 15-point nav map (Turn 6, phase/9-ia) -- same honest-stub posture as
  // Coming Soon above: no chat, no model, just what's real (a waitlist signup). See
  // app/hai/page.tsx's own comment.
  { href: "/hai" as Route, label: "Hai", icon: Wand2 },
];

// A platform-admin-only account (isPlatformAdminOnly below) has no researcher/org context
// for "Coming Soon" or "Hai" to mean anything -- both are researcher-facing feature
// previews, confirmed live to have zero relevance to an admin-only sidebar. Notifications
// stays (platform-admin actions -- approvals, rejections -- generate real notifications
// too), just narrowed to the one real destination for this context.
const PLATFORM_SYSTEM_NAV: NavItem[] = [{ href: "/notifications" as Route, label: "Notifications", icon: Bell }];

// Item 14 of the 15-point nav map (Turn 6, phase/9-ia): previously Settings + Sign out
// only. Profile (the real, existing /settings/profile route) and Help/Docs (the same
// real /help destination the top-bar HelpLink now points to, item 12 -- not a second,
// divergent doc surface) are added; Support is intentionally not a separate row here
// since /help itself is exactly one click from Send feedback, the real support channel.
const ACCOUNT_MENU_LINKS: { href: Route; label: string }[] = [
  { href: "/settings/profile" as Route, label: "Profile" },
  { href: "/settings" as Route, label: "Settings" },
  { href: "/help" as Route, label: "Help & docs" },
];

// Turn 8b: the org-level tab row (components/organizations/organization-header.tsx's own
// nine-item nav) is deleted -- this sidebar is now the ONE org nav, full stop. Nine
// destinations behind two independently-highlighting controls (the tab row's own
// path === item.href check never matched a program sub-route or a member-detail page,
// so "Engagements"/"Members" silently went dark exactly where a user most needed to see
// where they were) was flagged live, on a real screenshot, as the disease -- not the
// individual routes. New standing rule (AGENTS.md): one hierarchy level, one nav control.
//
// Hactivity (Turn 6, phase/9-ia) was missing from this list entirely -- built after this
// grouping's own comment was written, and never backfilled. Added here now; it was never
// missing from the org header's own nine, only from this second, now-deleted nav.
type OrgNavItem = { href: (organizationId: string) => Route; label: string; icon: React.ComponentType<{ className?: string }>; matchesPath: (path: string, href: string) => boolean };

// Home matches ONLY the exact org root -- every other org route also starts with
// `/organizations/{id}`, so a prefix match here would keep Home lit on every org page.
function exactMatch(path: string, href: string): boolean {
  return path === href;
}
// Every other org destination matches its own path and anything nested under it (e.g.
// Engagements stays highlighted while looking at one specific program, since that's a
// deeper level of the SAME hierarchy branch, not a different destination).
function prefixMatch(path: string, href: string): boolean {
  return path === href || path.startsWith(`${href}/`);
}

const ORG_OVERVIEW_NAV: OrgNavItem[] = [{ href: (id) => `/organizations/${id}` as Route, label: "Home", icon: LayoutDashboard, matchesPath: exactMatch }];
const ORG_SECURITY_NAV: OrgNavItem[] = [
  // Route unchanged (/organizations/{id}/programs) -- only the label changed to
  // "Engagements" to match the page's real HackerOne-style category-tab identity
  // (docs/decisions/0076). Same programs, same URLs, same permissions.
  { href: (id) => `/organizations/${id}/programs` as Route, label: "Engagements", icon: FolderKanban, matchesPath: prefixMatch },
  // Findings: the flat, cross-program report list (services/reports.ts's
  // listReportsForOrganization) -- distinct from the per-program triage inbox at
  // .../programs/{id}/reports, which still owns triage actions/bulk operations.
  { href: (id) => `/organizations/${id}/findings` as Route, label: "Findings", icon: Bug, matchesPath: prefixMatch },
  // Assets: the flat, cross-program scope/asset inventory (extends
  // public.program_scope_entries, docs/decisions/0006-scope-asset-model.md) -- creation/
  // editing still happens per-engagement (scope mutation is only legal while that
  // program is in draft), this is the read-only cross-program view.
  { href: (id) => `/organizations/${id}/assets` as Route, label: "Assets", icon: Target, matchesPath: prefixMatch },
  { href: (id) => `/organizations/${id}/researchers` as Route, label: "Researchers", icon: Trophy, matchesPath: prefixMatch },
  // Hactivity: the org's full, chronological audit event feed (services/organization-
  // members.ts's getOrganizationAuditActivity) -- owner/security_admin only, matching
  // audit_logs' own read policy.
  { href: (id) => `/organizations/${id}/hactivity` as Route, label: "Hactivity", icon: Activity, matchesPath: prefixMatch },
];
const ORG_INSIGHTS_NAV: OrgNavItem[] = [{ href: (id) => `/organizations/${id}/analytics` as Route, label: "Analytics", icon: FileWarning, matchesPath: prefixMatch }];
const ORG_ORGANIZATION_NAV: OrgNavItem[] = [
  { href: (id) => `/organizations/${id}/members` as Route, label: "Members", icon: Award, matchesPath: prefixMatch },
  { href: (id) => `/organizations/${id}/settings` as Route, label: "Settings", icon: ShieldCheck, matchesPath: prefixMatch },
];

type ShellUser = { displayName: string; email: string | null };

function AccountMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu
      label={
        <>
          <Avatar name={user.displayName} />
          <span className="sr-only">Account menu</span>
        </>
      }
    >
      <div className="px-3 py-2 text-sm">
        <p className="font-medium text-ink">{user.displayName}</p>
        {user.email && <p className="text-xs text-ink-muted">{user.email}</p>}
      </div>
      <Separator className="my-1" />
      {ACCOUNT_MENU_LINKS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          className="block min-h-11 rounded px-3 py-2.5 text-sm text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
        >
          {item.label}
        </Link>
      ))}
      <Separator className="my-1" />
      <form action={signOutAction}>
        <button type="submit" className="block min-h-11 w-full rounded px-3 text-left text-sm text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
          Sign out
        </button>
      </form>
    </DropdownMenu>
  );
}

/** A single global search field -- ⌘K opens it (focuses the input; no command-palette
 * overlay in this slice, just a fast way to reach the existing field without a mouse).
 * No search backend exists yet for a cross-entity query (programs+reports+researchers at
 * once) -- Enter routes to the real program search already built (docs/decisions/0053/
 * 0054), the one real search surface that exists today, rather than inventing a new one.
 * The placeholder says exactly that ("Search programs") rather than promising reports/
 * researchers too -- a prior placeholder text overclaimed the field's real scope, the
 * same kind of real/fake mismatch this pass is fixing everywhere else it appears. */
function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (trimmed) window.location.href = `/programs?q=${encodeURIComponent(trimmed)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden w-full max-w-md sm:block">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search programs…"
        aria-label="Global search"
        className="min-h-10 w-full rounded-md border border-border bg-surface/60 pl-9 pr-14 text-sm text-ink outline-none backdrop-blur transition-colors duration-200 placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25 motion-reduce:transition-none"
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-muted">
        ⌘K
      </kbd>
    </form>
  );
}

function NotificationBell({ unreadCount }: { unreadCount: number }) {
  return <NotificationBellDropdown initialUnreadCount={unreadCount} />;
}

// Previously pointed directly at /settings/feedback (see that commit's own comment on
// why -- no dedicated help center existed at the time). Turn 6/phase-9-ia built a real
// /help destination (support link, real docs, live-read release notes) -- this now
// points there instead, one level up from feedback rather than skipping straight to it.
function HelpLink() {
  return (
    <Link
      href={"/help" as Route}
      prefetch={false}
      aria-label="Help"
      title="Help"
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <HelpCircle aria-hidden="true" className="size-5" />
    </Link>
  );
}

/** docs/decisions/0074 -- active reads as a precise system state, not a large grey rounded
 * pill: a solid 2px ink rail (never the translucent green fill/glow this used before),
 * the label at full ink weight, and the icon filled solid ink -- the same "confirmed/
 * authoritative = black" rule the rest of this pass's color system uses. An inactive item
 * stays quiet (muted text, transparent rail) until hover, which only lightens the
 * background -- no color, no glow, so the one meaningful color signal in this sidebar
 * stays reserved for the badge counts below, not spent on "you are here." */
function NavLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-10 items-center gap-2.5 border-l-2 py-2 pl-2.5 pr-2.5 text-sm transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
        active ? "border-ink bg-surface-muted font-semibold text-ink" : "border-transparent font-medium text-ink-muted hover:bg-surface-hover hover:text-ink",
      )}
    >
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-muted")} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && <span className={cn("shrink-0 font-mono text-[10px] font-semibold tabular-nums", active ? "text-ink" : "text-ink-muted/70")}>{item.badge}</span>}
    </Link>
  );
}

/** Section labels read as quiet system-zone markers -- smaller, lower-contrast, wider
 * tracking than a normal heading -- never competing with the nav items themselves for
 * attention. Same treatment for every zone (RESEARCH/PRACTICE/RECORD/SYSTEM/Organization),
 * so the grouping reads as one consistent grammar, not five different label styles. */
function NavGroup({ label, items, path, onNavigate }: { label: string; items: NavItem[]; path: string; onNavigate: () => void }) {
  return (
    <div>
      <p className="px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted/60">{label}</p>
      <div className="mt-1.5 space-y-0.5">
        {items.map((item) => (
          <NavLink key={`${item.href}-${item.label}`} item={item} active={path === item.href} onClick={onNavigate} />
        ))}
      </div>
    </div>
  );
}

/** Renders one org-side nav zone (Overview/Security/Insights/Organization), resolving
 * each item's href against the real, currently-selected organizationId -- never a static
 * href, since every one of these routes is org-scoped by definition. */
function OrgNavGroup({ label, items, organizationId, path, onNavigate }: { label: string; items: OrgNavItem[]; organizationId: string; path: string; onNavigate: () => void }) {
  return (
    <div>
      <p className="px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-muted/60">{label}</p>
      <div className="mt-1.5 space-y-0.5">
        {items.map((item) => {
          const href = item.href(organizationId);
          const Icon = item.icon;
          const active = item.matchesPath(path, href);
          return (
            <Link
              key={item.label}
              href={href}
              prefetch={false}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-2.5 border-l-2 py-2 pl-2.5 pr-2.5 text-sm transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                active ? "border-ink bg-surface-muted font-semibold text-ink" : "border-transparent font-medium text-ink-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              <Icon aria-hidden="true" className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-muted")} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** docs/decisions/0075 -- the Organization Switcher. Replaces the prior single static
 * "Organizations" link with a real dropdown: current organization's real name/status,
 * every other real organization this user actively belongs to (listCurrentUserOrganizations
 * -- the identical query the /organizations picker page already uses, no new query), and a
 * link to the full picker page for anything beyond quick-switching (create another
 * organization, see pending invitations). Switching organization is a real navigation to
 * that organization's own Overview route -- never a client-side state swap that could
 * leak stale data between organizations; the URL segment is, and remains, the only source
 * of "which organization" for every server-rendered org-scoped page. */
function OrganizationSwitcher({ organizations, currentOrganizationId }: { organizations: OrganizationSummary[]; currentOrganizationId?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = organizations.find((org) => org.id === currentOrganizationId) ?? organizations[0];

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!current) return null;

  function handleSwitch(organizationId: string) {
    setOpen(false);
    router.push(`/organizations/${organizationId}` as Route);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-md border border-border px-2.5 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
      >
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", current.status === "active" ? "bg-success" : current.status === "suspended" ? "bg-danger" : "bg-ink-muted")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{current.name}</span>
          <span className="block truncate font-mono text-[10px] text-ink-muted">@{current.slug}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
      </button>

      {open && (
        <div role="menu" aria-label="Switch organization" className="glass-surface-raised motion-safe:animate-enter-rise absolute left-0 top-full z-30 mt-1 w-full min-w-56 rounded-md p-1 shadow-xl">
          {organizations.map((org) => (
            <button
              key={org.id}
              type="button"
              role="menuitemradio"
              aria-checked={org.id === current.id}
              onClick={() => handleSwitch(org.id)}
              className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-left text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
            >
              <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", org.status === "active" ? "bg-success" : org.status === "suspended" ? "bg-danger" : "bg-ink-muted")} />
              <span className="min-w-0 flex-1 truncate text-ink">{org.name}</span>
              {org.id === current.id && <Check aria-hidden="true" className="size-4 shrink-0 text-ink" />}
            </button>
          ))}
          <Separator className="my-1" />
          <Link
            href={"/organizations" as Route}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="flex min-h-11 w-full items-center gap-2 rounded px-2.5 text-sm text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            <Plus aria-hidden="true" className="size-4 shrink-0" />
            All organizations
          </Link>
        </div>
      )}
    </div>
  );
}

function SidebarBrand() {
  return (
    <Link href="/" prefetch={false} className="flex items-center gap-2 px-1 focus-visible:outline-2 focus-visible:outline-focus">
      <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-action text-on-action shadow-[0_0_14px_var(--glow-action)]">
        <ShieldCheck className="size-4" />
      </span>
      <span className="truncate font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-ink">Unpatched</span>
    </Link>
  );
}

/**
 * Context-routing, not a role system (docs/decisions/0030 -- no persistent role column
 * exists or should exist here): researcher-only sees the Research/Practice/Record zones;
 * organization-only sees the Organization Switcher + Overview/Security/Insights/
 * Organization zones instead, never both researcher destinations bolted alongside a
 * single org link; both-context sees both sets (the current URL, via each item's own
 * active-path highlighting, already shows which one is "active" -- no separate mode
 * switch needed); a brand-new signup with neither yet keeps the researcher zones so they
 * can still discover public programs, matching this product's explicit
 * no-invented-onboarding-flow stance. The researcher zones are suppressed in exactly one
 * case: organization-only.
 *
 * The org-side zones only render when there is a real `currentOrganizationId` to resolve
 * their hrefs against (an org-only/both-context user on a non-org-scoped page, e.g. their
 * own /settings, has organizations but no "current" one -- the switcher itself still
 * shows so they can navigate INTO an organization, but the zone links below it don't
 * render for a context that doesn't exist yet).
 */
function SidebarNav({
  path,
  organizations,
  currentOrganizationId,
  hasResearcherParticipation,
  isPlatformAdmin,
  onNavigate,
}: {
  path: string;
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  isPlatformAdmin: boolean;
  onNavigate: () => void;
}) {
  const hasOrganization = organizations.length > 0;
  const isOrganizationOnly = hasOrganization && !hasResearcherParticipation;
  // Only fall back to a guessed org when there is exactly one -- nothing ambiguous to
  // pick. With 2+ organizations and no real currentOrganizationId (e.g. the /organizations
  // picker page itself, which intentionally passes no organizationId to AppShell), this
  // used to silently resolve to organizations[0] -- confirmed live: it made the sidebar
  // render a full org-scoped nav (Findings, Engagements, etc.) as if that first-sorted
  // org were "current" while standing on the picker page for a DIFFERENT org, so clicking
  // Findings there silently opened the wrong organization's data. Falls through to
  // `undefined` for 2+ orgs, matching this function's own doc comment above (the org zone
  // links simply don't render without a real current org).
  const resolvedOrgId = currentOrganizationId ?? (isOrganizationOnly && organizations.length === 1 ? organizations[0]?.id : undefined);
  // A platform admin with no real organization membership and no real researcher
  // participation used to fall through to the "brand-new signup" case below (Research/
  // Practice/Record render whenever !isOrganizationOnly, and hasOrganization=false makes
  // that true regardless of admin status) -- confirmed live: an admin-only account saw
  // Dashboard/Programs/Reports/CTF/Learn/Bounties, none of it real or relevant to what
  // this account can actually do. Hidden specifically for that case (admin AND no real
  // researcher standing) -- an account that is BOTH a platform admin AND a real
  // researcher keeps its real researcher zones; admin status alone never erases a real
  // relationship this account actually has.
  const isPlatformAdminOnly = isPlatformAdmin && !hasResearcherParticipation;
  const showResearcherZones = !isOrganizationOnly && !isPlatformAdminOnly;

  return (
    <nav aria-label="Primary navigation" className="space-y-5">
      {showResearcherZones && (
        <>
          <NavGroup label="Research" items={RESEARCH_NAV} path={path} onNavigate={onNavigate} />
          <NavGroup label="Practice" items={PRACTICE_NAV} path={path} onNavigate={onNavigate} />
          <NavGroup label="Record" items={RECORD_NAV} path={path} onNavigate={onNavigate} />
        </>
      )}
      {hasOrganization && (
        <div className="space-y-3">
          <OrganizationSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} />
          {resolvedOrgId && (
            <div className="space-y-5">
              <OrgNavGroup label="Overview" items={ORG_OVERVIEW_NAV} organizationId={resolvedOrgId} path={path} onNavigate={onNavigate} />
              <OrgNavGroup label="Security" items={ORG_SECURITY_NAV} organizationId={resolvedOrgId} path={path} onNavigate={onNavigate} />
              <OrgNavGroup label="Insights" items={ORG_INSIGHTS_NAV} organizationId={resolvedOrgId} path={path} onNavigate={onNavigate} />
              <OrgNavGroup label="Organization" items={ORG_ORGANIZATION_NAV} organizationId={resolvedOrgId} path={path} onNavigate={onNavigate} />
            </div>
          )}
        </div>
      )}
      {isPlatformAdminOnly ? (
        <>
          <NavGroup label="Platform admin" items={PLATFORM_NAV} path={path} onNavigate={onNavigate} />
          <NavGroup label="System" items={PLATFORM_SYSTEM_NAV} path={path} onNavigate={onNavigate} />
        </>
      ) : (
        <>
          <NavGroup label="System" items={SYSTEM_NAV} path={path} onNavigate={onNavigate} />
          {isPlatformAdmin && <NavGroup label="Platform admin" items={PLATFORM_NAV} path={path} onNavigate={onNavigate} />}
        </>
      )}
    </nav>
  );
}

export function AppShellClient({
  title,
  children,
  user,
  organizations,
  currentOrganizationId,
  hasResearcherParticipation,
  unreadNotificationCount,
  isPlatformAdmin,
}: {
  title: string;
  children: React.ReactNode;
  user?: ShellUser | null;
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  unreadNotificationCount: number;
  isPlatformAdmin: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Framer Motion's initial/animate/transition props run their own JS-driven animation
  // loop and are never touched by Tailwind's motion-reduce: variant (that only rewrites
  // CSS classes) -- so every motion.* block below reads this directly and drops its
  // transform component under reduced motion, keeping the opacity fade only (the
  // "gentler, not zero" rule: a reduced-motion visitor gets an instant-feeling but not
  // literally instant transition, never full slide/translate motion, and never nothing
  // at all -- an abrupt hard cut is its own kind of jarring change).
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="relative min-h-dvh bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:outline-2 focus:outline-focus">
        Skip to content
      </a>

      {/* Top bar: brand (mobile only, desktop brand lives in the sidebar), search, and the
          right-side cluster (help, notifications, account) -- kept minimal per the
          redesign brief ("keep the top bar minimal"). Soft glass over the ambient
          background (docs/decisions/0062) rather than a flat opaque bar, so the warm
          gradient stays faintly visible as content scrolls beneath it. */}
      <header className="glass-surface sticky top-0 z-20 flex h-16 items-center gap-3 rounded-none border-x-0 border-t-0 px-4 lg:px-6">
        <IconButton label="Open navigation" variant="quiet" className="shrink-0 lg:hidden" onClick={() => setOpen(true)}>
          <Menu aria-hidden="true" className="size-5" />
        </IconButton>
        <div className="lg:hidden">
          <SidebarBrand />
        </div>
        <div className="flex-1">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <HelpLink />
          <NotificationBell unreadCount={unreadNotificationCount} />
          {user ? <AccountMenu user={user} /> : <Avatar name="Account" />}
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        {/* Persistent desktop sidebar -- floating smoked glass, one step above the
            atmospheric canvas rather than a flat opaque panel; the brand lives here at
            the top on desktop, not duplicated in the top bar. */}
        <aside className="glass-surface hidden min-h-[calc(100dvh-4rem)] flex-col gap-6 rounded-none border-y-0 border-l-0 p-3 lg:flex">
          <SidebarBrand />
          <SidebarNav path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} hasResearcherParticipation={hasResearcherParticipation} isPlatformAdmin={isPlatformAdmin} onNavigate={close} />
        </aside>

        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-30 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <button aria-label="Close navigation" className="absolute inset-0 bg-black/60" onClick={close} />
              <motion.aside
                initial={{ x: reducedMotion ? 0 : -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: reducedMotion ? 0 : -24, opacity: 0 }}
                transition={{ duration: reducedMotion ? 0.12 : 0.18, ease: "easeOut" }}
                className="glass-surface relative flex h-full w-72 flex-col gap-6 rounded-none border-y-0 border-l-0 p-3 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <SidebarBrand />
                  <IconButton label="Close navigation" variant="quiet" onClick={close}>
                    <X aria-hidden="true" className="size-5" />
                  </IconButton>
                </div>
                <SidebarNav path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} hasResearcherParticipation={hasResearcherParticipation} isPlatformAdmin={isPlatformAdmin} onNavigate={close} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.main
          id="main"
          key={path}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0.15 : 0.4, ease: "easeOut" }}
          className="min-w-0 p-4 sm:p-6 lg:p-8"
        >
          <div className="mx-auto max-w-[1440px]">
            <header className="mb-4 border-b border-border pb-3">
              <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            </header>
            {children}
          </div>
        </motion.main>
      </div>
    </div>
  );
}
