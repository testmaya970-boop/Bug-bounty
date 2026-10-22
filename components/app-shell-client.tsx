"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  SquaresFour,
  ShieldCheck,
  Crosshair,
  Target,
  Bug,
  Briefcase,
  UsersThree,
  UserList,
  Flag,
  BookOpenText,
  Coins,
  Bell,
  Question,
  HourglassMedium,
  Pulse,
  ChartLineUp,
  ClipboardText,
  ListBullets,
  Wallet,
  WarningOctagon,
  Buildings,
  IdentificationCard,
  Scales,
  ArrowsClockwise,
  Lifebuoy,
  Scroll,
  MagnifyingGlass,
  List,
  X,
  CaretUpDown,
  CaretUp,
  CaretDown,
  Check,
  Plus,
  Plug,
  Gear,
  EnvelopeSimple,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Avatar, DropdownMenu } from "./ui/navigation";
import { IconButton } from "./ui/button";
import { Separator } from "./ui/feedback";
import { NotificationBellDropdown } from "./notifications/notification-bell-dropdown";
import { cn } from "../lib/cn";
import { SIDEBAR_COOKIE } from "../lib/sidebar";
import { popoverMotion } from "./ui/popover-motion";
import { usePrefersReducedMotion } from "../lib/motion";
import { SignOutForm } from "./auth/sign-out-form";
import { MOCK_CTF_CHALLENGES } from "../lib/mock/ctf";
import { TRAINING_ARTICLES } from "../lib/training/content";
import type { OrganizationSummary } from "../services/organizations";
import type { OrganizationRole } from "../types/auth";

// Every <Link> in this file carries prefetch={false}: this shell renders on every
// authenticated page, so its nav/switcher/menu links are on-screen (and thus
// speculatively prefetched by the App Router) on every single request. Each prefetch is
// a full middleware invocation through the deliberately unconditional deactivated/MFA
// gate (lib/session/middleware.ts) -- measured live at ~11x the real navigation volume.
// Disabling prefetch here removes that request volume at the source; the gate itself
// stays unconditional with no header-based exception (a prior attempt at exactly that
// was reverted -- Sec-Fetch-Mode is a client-controlled signal for any raw HTTP client,
// which is precisely the threat the gate exists to catch).
type NavItem = { href: Route; label: string; icon: PhosphorIcon; badge?: string };

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
  { href: "/" as Route, label: "Dashboard", icon: SquaresFour },
  { href: "/programs" as Route, label: "Programs", icon: Crosshair },
  { href: "/reports" as Route, label: "Reports", icon: Bug },
  { href: "/researchers" as Route, label: "Researchers", icon: UsersThree },
];

const PRACTICE_NAV: NavItem[] = [
  { href: "/ctf" as Route, label: "CTF", icon: Flag, badge: MOCK_CTF_CHALLENGES.length.toString() },
  { href: "/learn" as Route, label: "Learn", icon: BookOpenText, badge: TRAINING_ARTICLES.length.toString() },
];

const RECORD_NAV: NavItem[] = [{ href: "/bounties" as Route, label: "Bounties", icon: Coins }];

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
  { href: "/platform" as Route, label: "Overview", icon: SquaresFour },
  { href: "/platform/all-programs" as Route, label: "All programs", icon: ListBullets },
  { href: "/platform/programs" as Route, label: "Program launches", icon: ClipboardText },
  { href: "/platform/organizations" as Route, label: "Organizations", icon: Buildings },
  { href: "/platform/researchers" as Route, label: "Researchers", icon: UsersThree },
  { href: "/platform/ctf-events" as Route, label: "CTF events", icon: Flag },
  { href: "/platform/kyc" as Route, label: "KYC", icon: IdentificationCard },
  { href: "/platform/payouts" as Route, label: "Payouts", icon: Wallet },
  { href: "/platform/mediations" as Route, label: "Mediations", icon: Scales },
  { href: "/platform/retests" as Route, label: "Retests", icon: ArrowsClockwise },
  { href: "/platform/needs-recovery" as Route, label: "Needs recovery", icon: Lifebuoy },
  { href: "/platform/errors" as Route, label: "Errors", icon: WarningOctagon },
  { href: "/platform/engagement" as Route, label: "Engagement emails", icon: EnvelopeSimple },
  { href: "/platform/integrations" as Route, label: "Integrations", icon: Plug },
  { href: "/platform/audit-log" as Route, label: "Audit log", icon: Scroll },
];

const SYSTEM_NAV: NavItem[] = [
  { href: "/notifications" as Route, label: "Notifications", icon: Bell },
  // A real, honest static stub -- not a fabricated feature preview. See
  // app/coming-soon/page.tsx's own comment for why this exists as a real destination
  // rather than a dead link (matches HackerOne's own reference nav, which documents
  // "Coming Soon" as its own destination).
  { href: "/coming-soon" as Route, label: "Coming Soon", icon: HourglassMedium },
];

// A platform-admin-only account (isPlatformAdminOnly below) has no researcher/org context
// for "Coming Soon" to mean anything -- it is a researcher-facing feature preview, confirmed live to have zero relevance to an admin-only sidebar. Notifications
// stays (platform-admin actions -- approvals, rejections -- generate real notifications
// too), just narrowed to the one real destination for this context.
const PLATFORM_SYSTEM_NAV: NavItem[] = [{ href: "/notifications" as Route, label: "Notifications", icon: Bell }];
const PLATFORM_MFA_SETUP_NAV: NavItem[] = [{ href: "/settings/security" as Route, label: "Set up two-factor", icon: ShieldCheck }];

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
// Activity (Turn 6, phase/9-ia) was missing from this list entirely -- built after this
// grouping's own comment was written, and never backfilled. Added here now; it was never
// missing from the org header's own nine, only from this second, now-deleted nav.
// roles: who the section is for (docs: services/authorization.ts's ACCESS_SUMMARIES). A
// convenience only -- every page and the database enforce access on their own.
type OrgNavItem = { href: (organizationId: string) => Route; label: string; icon: PhosphorIcon; matchesPath: (path: string, href: string) => boolean; roles?: readonly OrganizationRole[] };

const ORG_ADMINS: readonly OrganizationRole[] = ["owner", "security_admin"];
const REPORT_WORKERS: readonly OrganizationRole[] = ["owner", "security_admin", "program_manager", "triager"];

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

const ORG_OVERVIEW_NAV: OrgNavItem[] = [{ href: (id) => `/organizations/${id}` as Route, label: "Home", icon: SquaresFour, matchesPath: exactMatch }];
const ORG_SECURITY_NAV: OrgNavItem[] = [
  // Route unchanged (/organizations/{id}/programs) -- only the label changed to
  // "Engagements" to match the page's real HackerOne-style category-tab identity
  // (docs/decisions/0076). Same programs, same URLs, same permissions.
  { href: (id) => `/organizations/${id}/programs` as Route, label: "Engagements", icon: Briefcase, matchesPath: prefixMatch, roles: REPORT_WORKERS },
  // Findings: the flat, cross-program report list (services/reports.ts's
  // listReportsForOrganization) -- distinct from the per-program triage inbox at
  // .../programs/{id}/reports, which still owns triage actions/bulk operations.
  { href: (id) => `/organizations/${id}/findings` as Route, label: "Findings", icon: Bug, matchesPath: prefixMatch, roles: REPORT_WORKERS },
  // Assets: the flat, cross-program scope/asset inventory (extends
  // public.program_scope_entries, docs/decisions/0006-scope-asset-model.md) -- creation/
  // editing still happens per-engagement (scope mutation is only legal while that
  // program is in draft), this is the read-only cross-program view.
  { href: (id) => `/organizations/${id}/assets` as Route, label: "Assets", icon: Target, matchesPath: prefixMatch, roles: REPORT_WORKERS },
  { href: (id) => `/organizations/${id}/researchers` as Route, label: "Researchers", icon: UsersThree, matchesPath: prefixMatch, roles: ["owner", "security_admin", "program_manager"] },
  // Activity: the org's full, chronological audit event feed (services/organization-
  // members.ts's getOrganizationAuditActivity) -- owner/security_admin only, matching
  // audit_logs' own read policy.
  { href: (id) => `/organizations/${id}/activity` as Route, label: "Activity", icon: Pulse, matchesPath: prefixMatch, roles: ORG_ADMINS },
];
const ORG_INSIGHTS_NAV: OrgNavItem[] = [{ href: (id) => `/organizations/${id}/analytics` as Route, label: "Analytics", icon: ChartLineUp, matchesPath: prefixMatch, roles: ORG_ADMINS }];
const ORG_ORGANIZATION_NAV: OrgNavItem[] = [
  // Payments (202609250012): the payment ledger with report titles only -- billing admins' page.
  { href: (id) => `/organizations/${id}/payments` as Route, label: "Payments", icon: Wallet, matchesPath: prefixMatch, roles: ["owner", "security_admin", "billing_admin"] },
  { href: (id) => `/organizations/${id}/members` as Route, label: "Members", icon: UserList, matchesPath: prefixMatch, roles: ORG_ADMINS },
  { href: (id) => `/organizations/${id}/settings` as Route, label: "Settings", icon: Gear, matchesPath: prefixMatch, roles: ORG_ADMINS },
];

type ShellUser = { displayName: string; email: string | null };

function AccountMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu
      menuLabel="Account"
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
      <SignOutForm buttonClassName="block min-h-11 w-full rounded px-3 text-left text-sm text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus" />
    </DropdownMenu>
  );
}

/** The global search field -- ⌘K / Ctrl K focuses it. Enter opens /search, the one search
 * across programs, reports and public researcher profiles (search_everything, 202610190001),
 * where the database decides what this person may find. */
function GlobalSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  // The shortcut works with Ctrl or Cmd; the hint shows the one this keyboard has.
  const [shortcut, setShortcut] = useState("Ctrl K");

  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
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
    if (trimmed) window.location.href = `/search?q=${encodeURIComponent(trimmed)}`;
  }

  return (
    <form onSubmit={handleSubmit} className="relative hidden w-full max-w-md sm:block">
      <MagnifyingGlass aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search programs, reports, researchers…"
        aria-label="Global search"
        className="min-h-10 w-full rounded-md border border-border bg-surface/60 pl-9 pr-14 text-sm text-ink outline-none backdrop-blur transition-colors duration-200 placeholder:text-ink-muted focus-visible:border-focus focus-visible:ring-2 focus-visible:ring-focus/25 motion-reduce:transition-none"
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-muted">
        {shortcut}
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
/** Phones only: the search field is hidden below sm, so this takes Help's slot (which is
 * hidden there too) and opens the /search page with its own field. */
function MobileSearchLink() {
  return (
    <Link
      href={"/search" as Route}
      prefetch={false}
      aria-label="Search"
      title="Search"
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:hidden"
    >
      <MagnifyingGlass aria-hidden="true" className="size-5" />
    </Link>
  );
}

function HelpLink() {
  return (
    <Link
      href={"/help" as Route}
      prefetch={false}
      aria-label="Help"
      title="Help"
      // Phones: hidden -- "Help & docs" is in the account menu, and the bar has no room at 320px.
      className="hidden min-h-11 min-w-11 items-center sm:inline-flex justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <Question aria-hidden="true" className="size-5" />
    </Link>
  );
}

// Nav (22 Oct redesign, video-site guide layout on a navy panel): 14px regular labels, 24px
// icons 24px from the label, a rounded tinted pill + medium weight for "you are here", and
// sections split by hairlines under 16px titles. Fixed reference-guide rhythm: 40px rows, 12px
// section padding; long groups fold behind "Show more", and a very short screen scrolls without a scrollbar.
// Shared by NavLink and OrgNavGroup so the two nav zones can never drift into two styles.
const HOVER = "[@media(hover:hover)_and_(pointer:fine)]:hover" as const;
const ROW = "h-10";
const SECTION_GAP = "py-3";
const NAV_LINK_BASE = `group/nav relative flex ${ROW} shrink-0 items-center gap-6 rounded-[10px] text-sm transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`;
const NAV_LINK_ACTIVE = "bg-surface-muted font-medium text-ink";
const NAV_LINK_IDLE = `font-normal text-ink ${HOVER}:bg-surface-hover`;
const NAV_ICON = "size-6 shrink-0";
const navIconClass = (active: boolean) => cn(NAV_ICON, active ? "text-action" : "text-ink");
// YouTube-style section block: a hairline above every section but the first.
const NAV_SECTION = `border-t border-border ${SECTION_GAP} first:border-t-0 first:pt-0`;
// Collapsed rail: the label stays in the DOM as the link's accessible name (sr-only); the
// visible hover label is one fixed tooltip owned by AppShellClient, placed from the hovered
// element's data-rail-label. A CSS flyout needed overflow:visible, which stopped the rail from
// scrolling and cut off the lower nav on short screens.
function navLinkClass(active: boolean, collapsed: boolean) {
  return cn(NAV_LINK_BASE, collapsed ? "mx-auto w-10 justify-center" : "px-3", active ? NAV_LINK_ACTIVE : NAV_LINK_IDLE);
}

/** untitled: the first section reads without a title, as on the reference guide. */
function NavGroupLabel({ label, collapsed, untitled = false }: { label: string; collapsed: boolean; untitled?: boolean }) {
  if (collapsed || untitled) return <p className="sr-only">{label}</p>;
  return <p className="px-3 pb-1 pt-1.5 text-base font-semibold text-ink">{label}</p>;
}

/** Long groups show `limit` rows, then a "Show more" row; the active item is never hidden. */
function useFold<T>(items: T[], limit: number | undefined, activeIndex: number) {
  const [expanded, setExpanded] = useState(false);
  const foldable = limit !== undefined && items.length > limit + 1 && activeIndex < limit;
  const open = !foldable || expanded;
  return { visible: open ? items : items.slice(0, limit), foldable, open, toggle: () => setExpanded((was) => !was) };
}

function ShowMoreRow({ open, collapsed, hiddenCount, onClick }: { open: boolean; collapsed: boolean; hiddenCount: number; onClick: () => void }) {
  const label = open ? "Show less" : `Show ${hiddenCount} more`;
  const Icon = open ? CaretUp : CaretDown;
  return (
    <button type="button" onClick={onClick} aria-expanded={open} data-rail-label={label} className={cn(navLinkClass(false, collapsed), "w-full text-left text-ink-muted")}>
      <Icon aria-hidden="true" className={NAV_ICON} />
      <NavLabel label={label} collapsed={collapsed} />
    </button>
  );
}

function NavLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>;
}

function NavLink({ item, active, collapsed, onClick }: { item: NavItem; active: boolean; collapsed: boolean; onClick: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} prefetch={false} onClick={onClick} aria-current={active ? "page" : undefined} data-rail-label={item.label} className={navLinkClass(active, collapsed)}>
      <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className={navIconClass(active)} />
      <NavLabel label={item.label} collapsed={collapsed} />
      {item.badge && !collapsed && <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">{item.badge}</span>}
    </Link>
  );
}

// Exact match for "/" (every route starts with it -- a prefix match would keep Dashboard lit
// everywhere); prefix match for the rest so a sub-route keeps its parent lit (e.g.
// /platform/ctf-events/<id> keeps "CTF events" active), the same exactMatch/prefixMatch split
// OrgNavGroup already uses -- AGENTS.md's "you are here must never go dark on a sub-route" rule.
function isActive(item: NavItem, path: string) {
  return item.href === "/" || item.href === "/platform" ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

/** One nav section: a 16px title (none for the first), its rows, and "Show more" past `limit`. */
function NavGroup({ label, items, path, collapsed, onNavigate, untitled, limit }: { label: string; items: NavItem[]; path: string; collapsed: boolean; onNavigate: () => void; untitled?: boolean; limit?: number }) {
  const fold = useFold(items, limit, items.findIndex((item) => isActive(item, path)));
  return (
    <div className={NAV_SECTION}>
      <NavGroupLabel label={label} collapsed={collapsed} untitled={untitled} />
      <div className="flex flex-col">
        {fold.visible.map((item) => (
          <NavLink key={`${item.href}-${item.label}`} item={item} active={isActive(item, path)} collapsed={collapsed} onClick={onNavigate} />
        ))}
        {fold.foldable && <ShowMoreRow open={fold.open} collapsed={collapsed} hiddenCount={items.length - (limit ?? 0)} onClick={fold.toggle} />}
      </div>
    </div>
  );
}

/** Renders one org-side nav zone (Overview/Security/Insights/Organization), resolving
 * each item's href against the real, currently-selected organizationId -- never a static
 * href, since every one of these routes is org-scoped by definition. */
function OrgNavGroup({ label, items: allItems, organizationId, role, path, collapsed, onNavigate, untitled }: { label: string; items: OrgNavItem[]; organizationId: string; role?: OrganizationRole; path: string; collapsed: boolean; onNavigate: () => void; untitled?: boolean }) {
  const items = allItems.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)));
  if (items.length === 0) return null;
  return (
    <div className={NAV_SECTION}>
      <NavGroupLabel label={label} collapsed={collapsed} untitled={untitled} />
      <div className="flex flex-col">
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
              data-rail-label={item.label}
              className={navLinkClass(active, collapsed)}
            >
              <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className={navIconClass(active)} />
              <NavLabel label={item.label} collapsed={collapsed} />
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
function OrganizationSwitcher({ organizations, currentOrganizationId, collapsed = false, onExpand }: { organizations: OrganizationSummary[]; currentOrganizationId?: string; collapsed?: boolean; onExpand?: () => void }) {
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

  // Rail mode: the organization's initial; choosing it opens the sidebar so the full
  // switcher has room, rather than squeezing a menu out of a 64px column.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${current.name}: open the sidebar to switch organization`}
        data-rail-label={current.name}
        className={`group/nav relative mx-auto flex size-10 items-center justify-center rounded-md border border-border font-[family-name:var(--font-display)] text-sm font-bold text-ink transition-colors duration-150 ease-out ${HOVER}:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`}
      >
        <span aria-hidden="true">{current.name.charAt(0).toUpperCase()}</span>
      </button>
    );
  }

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
        <CaretUpDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
      </button>

      {(
        <div role="menu" aria-label="Switch organization" aria-hidden={!open} className={cn("glass-surface-raised absolute left-0 top-full z-30 mt-1 w-full min-w-56 rounded-md p-1 shadow-xl", popoverMotion(open, "top-left"))}>
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

/** compact: the phone header. Below 400px the wordmark hides and only the mark shows -- the
 * header measured 373px wide with it, overflowing a 320px screen by 41px (and 360px by 1px). */
function SidebarBrand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" prefetch={false} aria-label="Unpatched home" className="flex items-center gap-2 px-1 focus-visible:outline-2 focus-visible:outline-focus">
      {/* shadow-[...var(--glow-action)] removed -- --glow-action no longer exists, see app/globals.css */}
      <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-action text-on-action">
        <ShieldCheck weight="fill" className="size-4" />
      </span>
      <span aria-hidden="true" className={`${compact ? "hidden min-[400px]:inline" : ""} truncate font-[family-name:var(--font-display)] text-base font-semibold tracking-tight text-ink`}>Unpatched</span>
    </Link>
  );
}

/** Who is signed in, at the top of the panel: name and the role this view is acting as.
 * Links to the profile; the account menu (top bar) keeps settings and sign-out. */
function SidebarUserCard({ user, roleLabel, collapsed = false, onNavigate }: { user: ShellUser; roleLabel: string; collapsed?: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={"/settings/profile" as Route}
      prefetch={false}
      onClick={onNavigate}
      data-rail-label={`${user.displayName} · ${roleLabel}`}
      className={cn(
        `flex shrink-0 items-center gap-3 rounded-[10px] transition-colors duration-150 ease-out ${HOVER}:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`,
        collapsed ? "mx-auto size-10 justify-center" : "px-2 py-2",
      )}
    >
      <Avatar name={user.displayName} tinted />
      <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
        <span className="block truncate text-sm font-medium text-ink">{user.displayName}</span>
        <span className="block truncate text-xs text-ink-muted">{roleLabel}</span>
      </span>
    </Link>
  );
}

const ORG_ROLE_LABELS: Record<OrganizationRole, string> = { owner: "Owner", security_admin: "Security admin", program_manager: "Program manager", triager: "Triager", billing_admin: "Billing admin" };

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
 * their hrefs against. On an org-scoped page that id is the URL's own org segment; on a
 * non-org-scoped page (Settings, Help, Notifications) AppShell (components/app-shell.tsx)
 * already resolved it from the `last_organization_id` cookie -- the real org this user
 * most recently navigated into, re-validated there against their actual memberships --
 * before this component ever runs. This component itself never guesses: with zero real
 * signal (a brand-new account, or a cookie naming an org this user has since left),
 * `currentOrganizationId` is genuinely absent and the zone links correctly don't render,
 * same as before this fallback existed -- see the array-order-guessing bug this codebase
 * already fixed once (organizations[0] used as "current" made a nav link silently open the
 * wrong organization's data), which is exactly what re-validating the cookie prevents.
 */
function SidebarNav({
  path,
  organizations,
  currentOrganizationId,
  hasResearcherParticipation,
  isPlatformAdmin,
  platformAdminNeedsMfa,
  collapsed = false,
  onExpand,
  onNavigate,
}: {
  path: string;
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  isPlatformAdmin: boolean;
  platformAdminNeedsMfa: boolean;
  collapsed?: boolean;
  onExpand?: () => void;
  onNavigate: () => void;
}) {
  // A platform admin without MFA has no admin power yet (202610100001) and every other page
  // redirects to setup, so the only real destination is the setup step itself.
  if (platformAdminNeedsMfa) {
    return (
      <nav aria-label="Primary navigation">
        <NavGroup label="Platform admin" items={PLATFORM_MFA_SETUP_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} untitled />
      </nav>
    );
  }

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
  // A platform admin is platform staff: the platform-admin nav only, never the researcher
  // zones (Dashboard/Programs/Reports/CTF/Learn/Bounties) -- even if the account once took
  // part in a program. Same strict separation as researcher vs organization accounts; the
  // home page and settings follow the same rule (app/page.tsx, lib/auth/account-type.ts).
  const isPlatformAdminOnly = isPlatformAdmin;
  const resolvedOrgRole = organizations.find((org) => org.id === resolvedOrgId)?.role;
  const showResearcherZones = !isOrganizationOnly && !isPlatformAdminOnly;

  return (
    // Every section is a direct child, so NAV_SECTION's first: rule drops the first hairline.
    <nav aria-label="Primary navigation">
      {showResearcherZones && (
        <>
          <NavGroup label="Research" items={RESEARCH_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} untitled />
          <NavGroup label="Practice" items={PRACTICE_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} />
          <NavGroup label="Record" items={RECORD_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} />
        </>
      )}
      {hasOrganization && (
        <>
          <div className={NAV_SECTION}>
            <OrganizationSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} collapsed={collapsed} onExpand={onExpand} />
          </div>
          {resolvedOrgId && (
            <>
              <OrgNavGroup label="Overview" items={ORG_OVERVIEW_NAV} organizationId={resolvedOrgId} role={resolvedOrgRole} path={path} collapsed={collapsed} onNavigate={onNavigate} untitled />
              <OrgNavGroup label="Security" items={ORG_SECURITY_NAV} organizationId={resolvedOrgId} role={resolvedOrgRole} path={path} collapsed={collapsed} onNavigate={onNavigate} />
              <OrgNavGroup label="Insights" items={ORG_INSIGHTS_NAV} organizationId={resolvedOrgId} role={resolvedOrgRole} path={path} collapsed={collapsed} onNavigate={onNavigate} />
              <OrgNavGroup label="Organization" items={ORG_ORGANIZATION_NAV} organizationId={resolvedOrgId} role={resolvedOrgRole} path={path} collapsed={collapsed} onNavigate={onNavigate} />
            </>
          )}
        </>
      )}
      {isPlatformAdminOnly ? (
        <>
          <NavGroup label="Platform admin" items={PLATFORM_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} limit={7} />
          <NavGroup label="System" items={PLATFORM_SYSTEM_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} />
        </>
      ) : (
        <NavGroup label="System" items={SYSTEM_NAV} path={path} collapsed={collapsed} onNavigate={onNavigate} />
      )}
    </nav>
  );
}

export function AppShellClient({
  title,
  titleIsSection = false,
  children,
  user,
  organizations,
  currentOrganizationId,
  hasResearcherParticipation,
  unreadNotificationCount,
  isPlatformAdmin,
  platformAdminNeedsMfa = false,
  initialSidebarCollapsed = false,
}: {
  title: string;
  titleIsSection?: boolean;
  children: React.ReactNode;
  user?: ShellUser | null;
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  unreadNotificationCount: number;
  isPlatformAdmin: boolean;
  platformAdminNeedsMfa?: boolean;
  initialSidebarCollapsed?: boolean;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Desktop sidebar: open (15.5rem) or an icon rail (4rem). A click animates the width; the
  // "[" shortcut switches instantly (keyboard actions are never animated). Remembered in a
  // cookie that AppShell reads on the server, so a reload paints the chosen width directly.
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [instant, setInstant] = useState(false);
  const [railTip, setRailTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const showRailTip = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-rail-label]");
    if (!el) return setRailTip(null);
    const rect = el.getBoundingClientRect();
    setRailTip({ label: el.dataset.railLabel ?? "", top: rect.top + rect.height / 2, left: rect.right + 12 });
  };
  const toggleSidebar = useCallback((fromKeyboard = false) => {
    setInstant(fromKeyboard);
    setRailTip(null);
    setCollapsed((was) => {
      document.cookie = `${SIDEBAR_COOKIE}=${was ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
      return !was;
    });
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      event.preventDefault();
      toggleSidebar(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);
  const close = () => setOpen(false);
  // The mobile drawer is modal: Escape closes it, like every Dialog in this app.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  // Framer Motion's initial/animate/transition props run their own JS-driven animation
  // loop and are never touched by Tailwind's motion-reduce: variant (that only rewrites
  // CSS classes) -- so every motion.* block below reads this directly and drops its
  // transform component under reduced motion, keeping the opacity fade only (the
  // "gentler, not zero" rule: a reduced-motion visitor gets an instant-feeling but not
  // literally instant transition, never full slide/translate motion, and never nothing
  // at all -- an abrupt hard cut is its own kind of jarring change).
  const reducedMotion = usePrefersReducedMotion();
  const currentOrgRole = organizations.find((org) => org.id === currentOrganizationId)?.role;
  const roleLabel = isPlatformAdmin
    ? "Platform admin"
    : currentOrgRole && (path.startsWith("/organizations/") || !hasResearcherParticipation)
      ? ORG_ROLE_LABELS[currentOrgRole]
      : "Researcher";

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
      <header className="glass-surface sticky top-0 z-20 flex h-16 items-center gap-2 rounded-none border-x-0 border-t-0 px-3 sm:gap-3 sm:px-4 lg:px-6">
        {/* Menu button + logo lead the bar, as on the reference guide: on phones it opens the
            drawer, on desktop it folds the sidebar to its icon rail ("[" does the same). */}
        <IconButton label="Open navigation" variant="quiet" className="shrink-0 lg:hidden" onClick={() => setOpen(true)}>
          <List aria-hidden="true" className="size-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => toggleSidebar()}
          aria-controls="desktop-sidebar"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar  [`}
          className={`hidden size-10 shrink-0 items-center justify-center rounded-full text-ink transition-colors duration-150 ease-out ${HOVER}:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.97] motion-reduce:active:scale-100 lg:inline-flex`}
        >
          <List aria-hidden="true" className="size-6" />
        </button>
        <div className="shrink-0 lg:w-44">
          <SidebarBrand compact />
        </div>
        {/* min-w-0: a flex child won't shrink below its content otherwise, and the search
            field pushed the account button 2px past a 375px phone screen. */}
        <div className="min-w-0 flex-1">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <MobileSearchLink />
          <HelpLink />
          <NotificationBell unreadCount={unreadNotificationCount} />
          {user ? <AccountMenu user={user} /> : <Avatar name="Account" />}
        </div>
      </header>

      {/* The column width is the one thing that moves: an on-screen morph, so ease-in-out at
          200ms. Width animates here because a sidebar has no transform equivalent that keeps
          the content column reflowing beside it. */}
      <div
        className={cn(
          "lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
          instant && "lg:transition-none",
          collapsed ? "lg:grid-cols-[4.5rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]",
        )}
      >
        {/* Sticky under the top bar. Rows scale with viewport height so the whole nav fits;
            on a screen too short even for that it still scrolls, just without a scrollbar. */}
        <aside
          id="desktop-sidebar"
          aria-label="Sidebar"
          onPointerOver={collapsed ? (event) => showRailTip(event.target) : undefined}
          onPointerLeave={() => setRailTip(null)}
          onFocus={collapsed ? (event) => showRailTip(event.target) : undefined}
          onBlur={() => setRailTip(null)}
          onScroll={() => setRailTip(null)}
          className={cn(
            "nav-scope sticky top-16 hidden h-[calc(100dvh-4rem)] flex-col overflow-y-auto overscroll-contain bg-surface py-3 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden",
            collapsed ? "px-2" : "px-3",
          )}
        >
          {user && (
            <div className="mb-3 border-b border-border pb-3">
              <SidebarUserCard user={user} roleLabel={roleLabel} collapsed={collapsed} onNavigate={close} />
            </div>
          )}
          <SidebarNav path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} hasResearcherParticipation={hasResearcherParticipation} isPlatformAdmin={isPlatformAdmin} platformAdminNeedsMfa={platformAdminNeedsMfa} collapsed={collapsed} onExpand={() => toggleSidebar()} onNavigate={close} />
        </aside>
        {/* The rail's hover/focus label. One element that moves between icons: the first one
            fades in (150ms); moving to the next is instant, like a toolbar's tooltips. */}
        {collapsed && railTip && (
          <span
            aria-hidden="true"
            style={{ top: railTip.top, left: railTip.left }}
            className="pointer-events-none fixed z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-md transition-opacity duration-150 ease-out starting:opacity-0 lg:block"
          >
            {railTip.label}
          </span>
        )}

        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-30 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.26 }}
            >
              {/* Mouse convenience only: hidden from assistive tech and the tab order so the drawer has one
                  "Close navigation" control (the X below; Escape also closes it). */}
              <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0 bg-black/60" onClick={close} />
              {/* Slides from the screen edge on the iOS drawer curve, 260ms in, 200ms out. The
                  full transform string (not Motion's x shorthand) keeps it on the GPU while the
                  page is busy. Reduced motion: fade only. */}
              <motion.aside
                initial={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)" }}
                animate={reducedMotion ? { opacity: 1 } : { transform: "translateX(0%)", transition: { duration: 0.26, ease: [0.32, 0.72, 0, 1] } }}
                exit={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)", transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
                transition={{ duration: 0.15 }}
                className="nav-scope relative flex h-full w-72 flex-col gap-3 overflow-y-auto bg-surface p-3 shadow-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex items-center justify-between">
                  <SidebarBrand />
                  <IconButton label="Close navigation" variant="quiet" onClick={close}>
                    <X aria-hidden="true" className="size-5" />
                  </IconButton>
                </div>
                {user && (
                  <div className="border-b border-border pb-3">
                    <SidebarUserCard user={user} roleLabel={roleLabel} onNavigate={close} />
                  </div>
                )}
                <SidebarNav path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} hasResearcherParticipation={hasResearcherParticipation} isPlatformAdmin={isPlatformAdmin} platformAdminNeedsMfa={platformAdminNeedsMfa} onNavigate={close} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No page-change animation: navigation happens tens of times a day, and a 400ms
            fade on every click made a fast server feel slow (Emil Kowalski review). */}
        <main id="main" className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px]">
            <header className="mb-4 border-b border-border pb-3">
              {/* One h1 per page: under a section title (Settings) the child page owns it. */}
              {titleIsSection ? (
                <p className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight sm:text-2xl">{title}</p>
              ) : (
                <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
              )}
            </header>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
