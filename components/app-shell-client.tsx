"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  HourglassMedium,
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
  CaretDown,
  CaretRight,
  CaretUp,
  CaretUpDown,
  Check,
  Plus,
  Plug,
  Gear,
  EnvelopeSimple,
  SidebarSimple,
  FileText,
  ChartPieSlice,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import { Avatar, DropdownMenu } from "./ui/navigation";
import { IconButton } from "./ui/button";
import { Separator } from "./ui/feedback";
import { NotificationBellDropdown } from "./notifications/notification-bell-dropdown";
import { CommandPalette, ShortcutSheet, type CommandItem } from "./command-palette";
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
// authenticated page, so its links are on-screen (and would be speculatively prefetched) on
// every request -- each prefetch a full middleware run through the unconditional
// deactivated/MFA gate (lib/session/middleware.ts), measured at ~11x real navigation volume.
// Fixed at the source; the gate keeps no header-based exception (AGENTS.md).
//
// Shell (22 Oct, Linear-style): no desktop top bar. The sidebar carries the account menu,
// the inbox bell and a "Search ⌘K" command menu; navigation is keyboard-first (⌘K, "G then a
// letter", "[" to fold the sidebar, "?" for the list). Phones keep a slim top bar + drawer.
// One nav model (buildNav) feeds the sidebar, the command menu and the shortcuts, so the three
// can never offer different destinations.
type NavItem = { href: Route; label: string; icon: PhosphorIcon; badge?: string; goKey?: string; exact?: boolean; roles?: readonly OrganizationRole[] };
type NavSection = { id: string; label: string; items: NavItem[]; limit?: number; orgSwitcher?: boolean };

// Research zones (docs/decisions/0074). No separate Leaderboard (it lives in /researchers,
// 0065) and no "Workspace" group (it duplicated these destinations, 0059).
const RESEARCH_NAV: NavItem[] = [
  { href: "/" as Route, label: "Dashboard", icon: SquaresFour, goKey: "D", exact: true },
  { href: "/programs" as Route, label: "Programs", icon: Crosshair, goKey: "P" },
  { href: "/reports" as Route, label: "Reports", icon: Bug, goKey: "R" },
  { href: "/researchers" as Route, label: "Researchers", icon: UsersThree, goKey: "L" },
];
const PRACTICE_NAV: NavItem[] = [
  { href: "/ctf" as Route, label: "CTF", icon: Flag, badge: MOCK_CTF_CHALLENGES.length.toString(), goKey: "C" },
  { href: "/learn" as Route, label: "Learn", icon: BookOpenText, badge: TRAINING_ARTICLES.length.toString() },
];
// Earnings documents (payout receipts, statements, tax certificates) live under Bounties.
const RECORD_NAV: NavItem[] = [
  { href: "/bounties" as Route, label: "Bounties", icon: Coins, goKey: "B" },
  { href: "/bounties/documents" as Route, label: "Tax & documents", icon: FileText },
];

// Platform-admin nav: every app/platform/* page. Each page re-checks isPlatformAdmin()
// server-side; this group is discoverability only, never the authorization boundary.
const PLATFORM_NAV: NavItem[] = [
  { href: "/platform" as Route, label: "Overview", icon: SquaresFour, goKey: "O", exact: true },
  { href: "/platform/all-programs" as Route, label: "All programs", icon: ListBullets, goKey: "P" },
  { href: "/platform/programs" as Route, label: "Program launches", icon: ClipboardText },
  { href: "/platform/organizations" as Route, label: "Organizations", icon: Buildings },
  { href: "/platform/researchers" as Route, label: "Researchers", icon: UsersThree },
  { href: "/platform/ctf-events" as Route, label: "CTF events", icon: Flag },
  { href: "/platform/kyc" as Route, label: "KYC", icon: IdentificationCard, goKey: "K" },
  { href: "/platform/payouts" as Route, label: "Payouts", icon: Wallet, goKey: "Y" },
  { href: "/platform/mediations" as Route, label: "Mediations", icon: Scales },
  { href: "/platform/retests" as Route, label: "Retests", icon: ArrowsClockwise },
  { href: "/platform/needs-recovery" as Route, label: "Needs recovery", icon: Lifebuoy },
  { href: "/platform/errors" as Route, label: "Errors", icon: WarningOctagon, goKey: "E" },
  { href: "/platform/engagement" as Route, label: "Engagement emails", icon: EnvelopeSimple },
  { href: "/platform/integrations" as Route, label: "Integrations", icon: Plug },
  { href: "/platform/audit-log" as Route, label: "Audit log", icon: Scroll },
];

// Coming Soon is an honest static stub (app/coming-soon/page.tsx), researcher-facing only.
const SYSTEM_NAV: NavItem[] = [
  { href: "/notifications" as Route, label: "Notifications", icon: Bell, goKey: "N" },
  { href: "/coming-soon" as Route, label: "Coming Soon", icon: HourglassMedium },
];
const PLATFORM_SYSTEM_NAV: NavItem[] = [{ href: "/notifications" as Route, label: "Notifications", icon: Bell, goKey: "N" }];
const PLATFORM_MFA_SETUP_NAV: NavItem[] = [{ href: "/settings/security" as Route, label: "Set up two-factor", icon: ShieldCheck }];

// Profile, Settings and Help (the same /help the old top-bar link opened). Support is one
// click from /help (Send feedback), so it has no row of its own.
const ACCOUNT_MENU_LINKS: { href: Route; label: string }[] = [
  { href: "/settings/profile" as Route, label: "Profile" },
  { href: "/settings" as Route, label: "Settings" },
  { href: "/help" as Route, label: "Help & docs" },
];

// The ONE org nav (Turn 8b deleted the org tab row: one hierarchy level, one nav control).
// roles: who the section is for (services/authorization.ts ACCESS_SUMMARIES) -- a
// convenience only; every page and the database enforce access on their own.
const ORG_ADMINS: readonly OrganizationRole[] = ["owner", "security_admin"];
const REPORT_WORKERS: readonly OrganizationRole[] = ["owner", "security_admin", "program_manager", "triager"];
const BILLING: readonly OrganizationRole[] = ["owner", "security_admin", "billing_admin"];
function orgSections(id: string): NavSection[] {
  const base = `/organizations/${id}`;
  return [
    // Home matches only the exact org root: every org route starts with it.
    { id: "org-overview", label: "Overview", items: [{ href: base as Route, label: "Home", icon: SquaresFour, goKey: "H", exact: true }] },
    {
      id: "org-security",
      label: "Security",
      items: [
        // Label "Engagements", route unchanged (docs/decisions/0076).
        { href: `${base}/programs` as Route, label: "Engagements", icon: Briefcase, goKey: "E", roles: REPORT_WORKERS },
        // Findings: the flat cross-program list; per-program inboxes still own triage actions.
        { href: `${base}/findings` as Route, label: "Findings", icon: Bug, goKey: "F", roles: REPORT_WORKERS },
        // Assets: the cross-program inventory with risk posture; editing stays per engagement.
        { href: `${base}/assets` as Route, label: "Assets", icon: Target, goKey: "A", roles: REPORT_WORKERS },
        { href: `${base}/researchers` as Route, label: "Researchers", icon: UsersThree, roles: ["owner", "security_admin", "program_manager"] },
        // Audit log: every change in the organization (scope, programs, members, billing...),
        // owner/security_admin only (audit_logs' read policy). Route kept as /activity.
        { href: `${base}/activity` as Route, label: "Audit log", icon: Scroll, goKey: "U", roles: ORG_ADMINS },
      ],
    },
    { id: "org-insights", label: "Insights", items: [{ href: `${base}/analytics` as Route, label: "Analytics", icon: ChartLineUp, goKey: "I", roles: ORG_ADMINS }] },
    {
      id: "org-organization",
      label: "Organization",
      items: [
        // Payments: balance, ledger and every billing document -- billing admins' page.
        { href: `${base}/payments` as Route, label: "Payments", icon: Wallet, goKey: "$", roles: BILLING },
        { href: `${base}/payments/budgets` as Route, label: "Budgets", icon: ChartPieSlice, roles: BILLING },
        { href: `${base}/payments/documents` as Route, label: "Billing documents", icon: FileText, roles: BILLING },
        { href: `${base}/members` as Route, label: "Members", icon: UserList, goKey: "M", roles: ORG_ADMINS },
        { href: `${base}/settings` as Route, label: "Settings", icon: Gear, roles: ORG_ADMINS },
      ],
    },
  ];
}

type ShellUser = { displayName: string; email: string | null };
type NavContext = {
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  isPlatformAdmin: boolean;
  platformAdminNeedsMfa: boolean;
};

/**
 * Context-routing, not a role system (docs/decisions/0030): researcher-only sees the
 * research zones; organization-only sees the org switcher + org zones; both-context sees
 * both; a brand-new account keeps the research zones. A platform admin is platform staff:
 * the platform nav only (same strict separation as researcher vs organization accounts).
 *
 * Org zones render only with a real org id: the URL's own org segment, or AppShell's
 * re-validated last_organization_id cookie. With 2+ orgs and no real current org (the
 * /organizations picker) nothing is guessed: organizations[0] as "current" once made a nav
 * link silently open the wrong organization's data.
 */
function buildNav(ctx: NavContext): NavSection[] {
  if (ctx.platformAdminNeedsMfa) return [{ id: "mfa", label: "Platform admin", items: PLATFORM_MFA_SETUP_NAV }];
  if (ctx.isPlatformAdmin) {
    return [
      { id: "platform", label: "Platform admin", items: PLATFORM_NAV, limit: 8 },
      { id: "system", label: "System", items: PLATFORM_SYSTEM_NAV },
    ];
  }
  const hasOrganization = ctx.organizations.length > 0;
  const isOrganizationOnly = hasOrganization && !ctx.hasResearcherParticipation;
  const orgId = ctx.currentOrganizationId ?? (isOrganizationOnly && ctx.organizations.length === 1 ? ctx.organizations[0]?.id : undefined);
  const role = ctx.organizations.find((org) => org.id === orgId)?.role;
  const sections: NavSection[] = [];
  if (!isOrganizationOnly) {
    sections.push({ id: "research", label: "Research", items: RESEARCH_NAV }, { id: "practice", label: "Practice", items: PRACTICE_NAV }, { id: "record", label: "Earnings", items: RECORD_NAV });
  }
  if (hasOrganization) {
    const org = orgId ? orgSections(orgId).map((section) => ({ ...section, items: section.items.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role))) })) : [];
    sections.push({ id: "org-switcher", label: "Organization", items: [], orgSwitcher: true }, ...org.filter((section) => section.items.length > 0));
  }
  sections.push({ id: "system", label: "System", items: SYSTEM_NAV });
  return sections;
}

// Exact match for roots ("/", "/platform", an org's Home); prefix match for the rest so a
// sub-route keeps its parent lit -- "you are here" never goes dark on a sub-route. The most
// specific match wins, so /payments/documents lights "Billing documents", not "Payments".
function activeHref(sections: NavSection[], path: string): string | undefined {
  let best: string | undefined;
  for (const item of sections.flatMap((section) => section.items)) {
    const hit = item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.length)) best = item.href;
  }
  return best;
}

const HOVER = "[@media(hover:hover)_and_(pointer:fine)]:hover" as const;
// Linear-style rows: 30px, 13px medium labels, 16px icons 10px from the label, a quiet gray
// pill for "you are here" with the one brand-red mark on its icon.
const ROW_BASE = `group/nav relative flex h-[30px] shrink-0 items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors duration-100 ease-out motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`;
function rowClass(active: boolean, collapsed: boolean) {
  return cn(ROW_BASE, collapsed ? "mx-auto w-8 justify-center" : "px-2", active ? "bg-surface-muted text-ink" : `text-ink-muted ${HOVER}:bg-surface-hover ${HOVER}:text-ink`);
}

function NavLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  return <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate"}>{label}</span>;
}

function NavRow({ item, active, collapsed, onNavigate }: { item: NavItem; active: boolean; collapsed: boolean; onNavigate: () => void }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} prefetch={false} onClick={onNavigate} aria-current={active ? "page" : undefined} data-rail-label={item.label} className={rowClass(active, collapsed)}>
      <Icon aria-hidden="true" weight={active ? "fill" : "regular"} className={cn("size-4 shrink-0", active ? "text-action" : "text-ink-muted group-hover/nav:text-ink")} />
      <NavLabel label={item.label} collapsed={collapsed} />
      {item.badge && !collapsed && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{item.badge}</span>}
    </Link>
  );
}

// Folded sections are remembered per browser (a convenience; it renders fine without storage).
function useFoldedSections() {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      setFolded(JSON.parse(localStorage.getItem("unpatched_nav_folded") ?? "{}"));
    } catch {}
  }, []);
  const toggle = (id: string) =>
    setFolded((was) => {
      const next = { ...was, [id]: !was[id] };
      try {
        localStorage.setItem("unpatched_nav_folded", JSON.stringify(next));
      } catch {}
      return next;
    });
  return { folded, toggle };
}

/** A section: a small foldable header (none on the first), its rows, and "Show more" past `limit`. */
function Section({ section, first, active, collapsed, folded, onToggle, onNavigate }: { section: NavSection; first: boolean; active?: string; collapsed: boolean; folded: boolean; onToggle: () => void; onNavigate: () => void }) {
  const [more, setMore] = useState(false);
  const activeIndex = section.items.findIndex((item) => item.href === active);
  const foldable = section.limit !== undefined && section.items.length > section.limit + 1 && activeIndex < section.limit;
  const visible = foldable && !more ? section.items.slice(0, section.limit) : section.items;
  // A folded section still shows its active row, so "you are here" never disappears.
  const rows = folded && !collapsed ? visible.filter((item) => item.href === active) : visible;
  return (
    <div className={cn(!first && (collapsed ? "mt-2 border-t border-border pt-2" : "mt-4"))}>
      {collapsed || first ? (
        // The first section reads without a visible header; screen readers still get its name.
        <p className="sr-only">{section.label}</p>
      ) : (
        (
          <button type="button" onClick={onToggle} aria-expanded={!folded} className={`group/hdr mb-0.5 flex h-7 w-full items-center gap-1 rounded-md px-2 text-left text-xs font-medium text-ink-muted ${HOVER}:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`}>
            <span className="min-w-0 truncate">{section.label}</span>
            <CaretDown aria-hidden="true" weight="bold" className={cn("size-2.5 shrink-0 opacity-0 transition-[transform,opacity] duration-150 group-hover/hdr:opacity-100 group-focus-visible/hdr:opacity-100", folded && "-rotate-90 opacity-100")} />
          </button>
        )
      )}
      <div className="flex flex-col gap-px">
        {rows.map((item) => (
          <NavRow key={`${item.href}-${item.label}`} item={item} active={item.href === active} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {foldable && !(folded && !collapsed) && (
          <button type="button" onClick={() => setMore((was) => !was)} aria-expanded={more} data-rail-label={more ? "Show less" : "Show more"} className={cn(rowClass(false, collapsed), "w-full text-left")}>
            {more ? <CaretUp aria-hidden="true" className="size-4 shrink-0" /> : <CaretDown aria-hidden="true" className="size-4 shrink-0" />}
            <NavLabel label={more ? "Show less" : `Show ${section.items.length - (section.limit ?? 0)} more`} collapsed={collapsed} />
          </button>
        )}
      </div>
    </div>
  );
}

/** docs/decisions/0075 -- the Organization Switcher: the current organization, every other
 * one this user belongs to, and the picker page. Switching is a real navigation to that
 * organization's Home -- the URL segment stays the only source of "which organization". */
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
  const mark = <span aria-hidden="true" className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-ink text-[10px] font-bold text-canvas">{current.name.charAt(0).toUpperCase()}</span>;

  // Rail: the organization's initial; choosing it opens the sidebar for the full switcher.
  if (collapsed) {
    return (
      <button type="button" onClick={onExpand} aria-label={`${current.name}: open the sidebar to switch organization`} data-rail-label={current.name} className={cn(rowClass(false, true))}>
        {mark}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} className={cn(rowClass(false, false), "w-full text-ink")}>
        {mark}
        <span className="min-w-0 flex-1 truncate text-left">{current.name}</span>
        <span aria-hidden="true" title={current.status} className={cn("size-1.5 shrink-0 rounded-full", current.status === "active" ? "bg-success" : current.status === "suspended" ? "bg-danger" : "bg-ink-muted")} />
        <CaretUpDown aria-hidden="true" className="size-3.5 shrink-0 text-ink-muted" />
      </button>
      <div role="menu" aria-label="Switch organization" aria-hidden={!open} className={cn("glass-surface-raised absolute left-0 top-full z-30 mt-1 w-full min-w-56 rounded-lg p-1 shadow-xl", popoverMotion(open, "top-left"))}>
        {organizations.map((org) => (
          <button
            key={org.id}
            type="button"
            role="menuitemradio"
            aria-checked={org.id === current.id}
            onClick={() => {
              setOpen(false);
              router.push(`/organizations/${org.id}` as Route);
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
          >
            <span className="min-w-0 flex-1 truncate text-ink">{org.name}</span>
            <span className="shrink-0 font-mono text-[10px] text-ink-muted">@{org.slug}</span>
            {org.id === current.id && <Check aria-hidden="true" className="size-3.5 shrink-0 text-ink" />}
          </button>
        ))}
        <Separator className="my-1" />
        <Link href={"/organizations" as Route} prefetch={false} onClick={() => setOpen(false)} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
          <Plus aria-hidden="true" className="size-3.5 shrink-0" />
          All organizations
        </Link>
      </div>
    </div>
  );
}

function AccountMenuItems({ user }: { user: ShellUser }) {
  return (
    <>
      <div className="px-2.5 py-2 text-[13px]">
        <p className="font-medium text-ink">{user.displayName}</p>
        {user.email && <p className="text-xs text-ink-muted">{user.email}</p>}
      </div>
      <Separator className="my-1" />
      {ACCOUNT_MENU_LINKS.map((item) => (
        <Link key={item.href} href={item.href} prefetch={false} className="flex h-8 items-center rounded-md px-2.5 text-[13px] text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
          {item.label}
        </Link>
      ))}
      <Separator className="my-1" />
      <SignOutForm buttonClassName="flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus" />
    </>
  );
}

/** The sidebar's top row: who is signed in (opens the account menu) and the role in use. */
function SidebarAccount({ user, roleLabel, collapsed }: { user: ShellUser; roleLabel: string; collapsed: boolean }) {
  return (
    <DropdownMenu
      menuLabel="Account"
      align="left"
      className={collapsed ? "mx-auto" : "min-w-0 flex-1"}
      triggerClassName={cn("flex h-9 min-h-0 items-center gap-2 px-1.5 text-left", collapsed ? "w-9 justify-center px-0" : "w-full")}
      label={
        <>
          <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-action text-[11px] font-bold text-on-action">{user.displayName.trim().charAt(0).toUpperCase() || "?"}</span>
          <span className={collapsed ? "sr-only" : "min-w-0 flex-1"}>
            <span className="block truncate text-[13px] font-semibold leading-tight text-ink">{user.displayName}</span>
            <span className="block truncate text-[11px] font-normal leading-tight text-ink-muted">{roleLabel}</span>
          </span>
          {!collapsed && <CaretDown aria-hidden="true" className="size-3 shrink-0 text-ink-muted" />}
          <span className="sr-only">Account menu</span>
        </>
      }
    >
      <AccountMenuItems user={user} />
    </DropdownMenu>
  );
}

/** compact: the phone bar. Below 400px only the mark shows (the wordmark overflowed 320px). */
function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" prefetch={false} aria-label="Unpatched home" className="flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-focus">
      <span aria-hidden="true" className="inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-action text-on-action">
        <ShieldCheck weight="fill" className="size-3.5" />
      </span>
      <span aria-hidden="true" className={cn("truncate text-[15px] font-semibold tracking-tight text-ink", compact && "hidden min-[400px]:inline")}>Unpatched</span>
    </Link>
  );
}

function SidebarNav({ sections, path, organizations, currentOrganizationId, collapsed = false, onExpand, onNavigate }: { sections: NavSection[]; path: string; organizations: OrganizationSummary[]; currentOrganizationId?: string; collapsed?: boolean; onExpand?: () => void; onNavigate: () => void }) {
  const active = activeHref(sections, path);
  const { folded, toggle } = useFoldedSections();
  return (
    <nav aria-label="Primary navigation">
      {sections.map((section, i) =>
        section.orgSwitcher ? (
          <div key={section.id} className={cn(i > 0 && (collapsed ? "mt-2 border-t border-border pt-2" : "mt-4"))}>
            <OrganizationSwitcher organizations={organizations} currentOrganizationId={currentOrganizationId} collapsed={collapsed} onExpand={onExpand} />
          </div>
        ) : (
          // The section right after the org switcher reads as part of it (no header).
          <Section key={section.id} section={section} first={i === 0 || sections[i - 1]?.orgSwitcher === true} active={active} collapsed={collapsed} folded={!!folded[section.id]} onToggle={() => toggle(section.id)} onNavigate={onNavigate} />
        ),
      )}
    </nav>
  );
}

const ORG_ROLE_LABELS: Record<OrganizationRole, string> = { owner: "Owner", security_admin: "Security admin", program_manager: "Program manager", triager: "Triager", billing_admin: "Billing admin" };

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Desktop sidebar: open (15rem) or an icon rail (3.5rem). A click animates the width; the
  // "[" shortcut switches instantly (keyboard actions are never animated). Remembered in a
  // cookie AppShell reads on the server, so a reload paints the chosen width directly.
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [instant, setInstant] = useState(false);
  const [railTip, setRailTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const sections = useMemo(
    () => buildNav({ organizations, currentOrganizationId, hasResearcherParticipation, isPlatformAdmin, platformAdminNeedsMfa }),
    [organizations, currentOrganizationId, hasResearcherParticipation, isPlatformAdmin, platformAdminNeedsMfa],
  );
  const commands: CommandItem[] = useMemo(
    () => [
      ...sections.flatMap((section) => section.items.map((item) => ({ href: item.href, label: item.label, group: section.label, icon: item.icon, goKey: item.goKey }))),
      ...(platformAdminNeedsMfa ? [] : ACCOUNT_MENU_LINKS.map((item) => ({ href: item.href, label: item.label, group: "Account", icon: item.href === "/help" ? BookOpenText : Gear, goKey: item.href === "/settings" ? "S" : undefined }))),
    ],
    [sections, platformAdminNeedsMfa],
  );

  const showRailTip = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-rail-label]");
    if (!el) return setRailTip(null);
    const rect = el.getBoundingClientRect();
    setRailTip({ label: el.dataset.railLabel ?? "", top: rect.top + rect.height / 2, left: rect.right + 10 });
  };
  const toggleSidebar = useCallback((fromKeyboard = false) => {
    setInstant(fromKeyboard);
    setRailTip(null);
    setCollapsed((was) => {
      document.cookie = `${SIDEBAR_COOKIE}=${was ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
      return !was;
    });
  }, []);

  // Keyboard-first navigation: ⌘K / Ctrl K opens the command menu anywhere (even in a field);
  // the rest only when not typing: "[" folds the sidebar, "?" lists shortcuts, "G" then a letter
  // jumps (1.2s to press the second key).
  useEffect(() => {
    let goPending = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((was) => !was);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (goPending && Date.now() - goPending < 1200) {
        goPending = 0;
        const hit = commands.find((item) => item.goKey && item.goKey.toLowerCase() === event.key.toLowerCase());
        if (hit) {
          event.preventDefault();
          router.push(hit.href);
        }
        return;
      }
      if (event.key === "g" || event.key === "G") goPending = Date.now();
      else if (event.key === "?") {
        event.preventDefault();
        setSheetOpen(true);
      } else if (event.key === "[" && window.matchMedia("(min-width: 1024px)").matches) {
        event.preventDefault();
        toggleSidebar(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commands, router, toggleSidebar]);

  const close = () => setOpen(false);
  // The phone drawer is modal: Escape closes it, like every Dialog in this app.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const currentOrgRole = organizations.find((org) => org.id === currentOrganizationId)?.role;
  const roleLabel = isPlatformAdmin ? "Platform admin" : currentOrgRole && (path.startsWith("/organizations/") || !hasResearcherParticipation) ? ORG_ROLE_LABELS[currentOrgRole] : "Researcher";
  const quiet = `inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-100 ${HOVER}:bg-surface-hover ${HOVER}:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`;

  return (
    <div className="relative min-h-dvh bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-surface focus:px-4 focus:py-2 focus:outline-2 focus:outline-focus">
        Skip to content
      </a>

      {/* Phones and tablets only: menu, brand, search, inbox, account. Desktop has no top bar. */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-canvas/95 px-3 backdrop-blur lg:hidden">
        <IconButton label="Open navigation" variant="quiet" className="shrink-0" onClick={() => setOpen(true)}>
          <List aria-hidden="true" className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <Brand compact />
        </div>
        <Link href={"/search" as Route} prefetch={false} aria-label="Search" title="Search" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          <MagnifyingGlass aria-hidden="true" className="size-5" />
        </Link>
        <NotificationBellDropdown initialUnreadCount={unreadNotificationCount} />
        {user ? (
          <DropdownMenu
            menuLabel="Account"
            label={
              <>
                <Avatar name={user.displayName} />
                <span className="sr-only">Account menu</span>
              </>
            }
          >
            <AccountMenuItems user={user} />
          </DropdownMenu>
        ) : (
          <Avatar name="Account" />
        )}
      </header>

      {/* The column width is the one thing that moves (200ms ease-in-out): a sidebar has no
          transform equivalent that keeps the content column reflowing beside it. */}
      <div
        className={cn(
          "lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
          instant && "lg:transition-none",
          collapsed ? "lg:grid-cols-[3.5rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]",
        )}
      >
        <aside
          id="desktop-sidebar"
          aria-label="Sidebar"
          onPointerOver={collapsed ? (event) => showRailTip(event.target) : undefined}
          onPointerLeave={() => setRailTip(null)}
          onFocus={collapsed ? (event) => showRailTip(event.target) : undefined}
          onBlur={() => setRailTip(null)}
          onScroll={() => setRailTip(null)}
          className={cn(
            "nav-scope sticky top-0 hidden h-dvh flex-col overflow-y-auto overscroll-contain border-r border-border bg-surface pb-3 [scrollbar-width:none] lg:flex [&::-webkit-scrollbar]:hidden",
            collapsed ? "px-2" : "px-2.5",
          )}
        >
          <div className={cn("flex items-center gap-1 pt-2.5", collapsed && "flex-col")}>
            {user ? <SidebarAccount user={user} roleLabel={roleLabel} collapsed={collapsed} /> : <Brand />}
            <NotificationBellDropdown initialUnreadCount={unreadNotificationCount} align="left" />
            <button type="button" onClick={() => toggleSidebar()} aria-controls="desktop-sidebar" aria-expanded={!collapsed} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} data-rail-label="Expand sidebar  [" title={collapsed ? undefined : "Collapse sidebar  ["} className={quiet}>
              {collapsed ? <CaretRight aria-hidden="true" className="size-4" /> : <SidebarSimple aria-hidden="true" className="size-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command menu"
            data-rail-label="Search  ⌘K"
            className={cn(
              `mb-3 mt-2 flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-canvas text-[13px] text-ink-muted transition-colors duration-100 ${HOVER}:border-border-strong ${HOVER}:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus`,
              collapsed ? "mx-auto w-8 justify-center" : "px-2",
            )}
          >
            <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0" />
            <span className={collapsed ? "sr-only" : "flex-1 text-left"}>Search or jump to…</span>
            {!collapsed && <kbd className="rounded border border-border px-1 font-mono text-[10px]">⌘K</kbd>}
          </button>
          <SidebarNav sections={sections} path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} collapsed={collapsed} onExpand={() => toggleSidebar()} onNavigate={close} />
          {!collapsed && (
            <button type="button" onClick={() => setSheetOpen(true)} className={`mt-auto flex h-7 shrink-0 items-center gap-2 rounded-md px-2 pt-6 text-xs text-ink-muted ${HOVER}:text-ink`}>
              <kbd className="rounded border border-border px-1 font-mono text-[10px]">?</kbd>
              Keyboard shortcuts
            </button>
          )}
        </aside>
        {/* The rail's hover/focus label: one element that moves between icons. */}
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
            <motion.div className="fixed inset-0 z-30 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }} transition={{ duration: 0.26 }}>
              {/* Mouse convenience only: the drawer has one "Close navigation" control (and Escape). */}
              <button type="button" aria-hidden="true" tabIndex={-1} className="absolute inset-0 bg-black/40" onClick={close} />
              {/* iOS drawer curve, 260ms in / 200ms out; full transform string keeps it on the GPU. Reduced motion: fade only. */}
              <motion.aside
                initial={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)" }}
                animate={reducedMotion ? { opacity: 1 } : { transform: "translateX(0%)", transition: { duration: 0.26, ease: [0.32, 0.72, 0, 1] } }}
                exit={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)", transition: { duration: 0.2, ease: [0.32, 0.72, 0, 1] } }}
                transition={{ duration: 0.15 }}
                className="nav-scope relative flex h-full w-72 flex-col gap-3 overflow-y-auto bg-surface p-3 shadow-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <div className="flex items-center justify-between">
                  <Brand />
                  <IconButton label="Close navigation" variant="quiet" onClick={close}>
                    <X aria-hidden="true" className="size-5" />
                  </IconButton>
                </div>
                <SidebarNav sections={sections} path={path} organizations={organizations} currentOrganizationId={currentOrganizationId} onNavigate={close} />
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No page-change animation: navigation happens tens of times a day (Emil Kowalski review). */}
        <main id="main" className="min-w-0">
          {/* Linear-style page bar: the page name in a quiet 48px strip, not a hero heading. */}
          <header className="sticky top-14 z-10 flex h-12 items-center border-b border-border bg-canvas/95 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
            {/* One h1 per page: under a section title (Settings) the child page owns it. */}
            {titleIsSection ? <p className="truncate text-[15px] font-semibold tracking-tight">{title}</p> : <h1 className="truncate text-[15px] font-semibold tracking-tight">{title}</h1>}
          </header>
          <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:px-8">{children}</div>
        </main>
      </div>
      <CommandPalette open={paletteOpen} items={commands} onClose={() => setPaletteOpen(false)} />
      <ShortcutSheet open={sheetOpen} items={commands} onClose={() => setSheetOpen(false)} />
    </div>
  );
}
