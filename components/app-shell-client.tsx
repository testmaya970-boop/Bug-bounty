"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Crosshair,
  Target,
  Bug,
  Briefcase,
  Users,
  UserCheck,
  Flag,
  BookOpen,
  Coins,
  Bell,
  TrendingUp,
  BarChart3,
  FileText,
  ListFilter,
  CreditCard,
  Wallet,
  Building2,
  Scale,
  RefreshCw,
  LifeBuoy,
  AlertOctagon,
  Search,
  Menu,
  X,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  Check,
  Plus,
  Plug,
  Settings,
  Mail,
  PanelLeftClose,
  PanelLeft,
  PieChart,
  Award,
  Package,
  MessageSquare,
  Headphones,
  Layers,
  Table,
  Zap,
  Sparkles,
  BadgeCheck,
  Lock,
  Sliders,
  GitBranch,
  Globe,
  FolderGit2,
  Smartphone,
  KeyRound,
  History,
  Palette,
  CheckCircle2,
  ExternalLink,
  Bot,
  Receipt,
  User,
  HelpCircle,
  LogOut,
  Calendar,
  GraduationCap,
  Trophy,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
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

type ShellUser = { displayName: string; email: string | null };

export interface SubNavItem {
  href: Route;
  label: string;
  icon?: LucideIcon;
  badge?: string;
  exact?: boolean;
  roles?: readonly OrganizationRole[];
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  href?: Route;
  exact?: boolean;
  badge?: string;
  roles?: readonly OrganizationRole[];
  items?: SubNavItem[];
  defaultOpen?: boolean;
}

export interface NavSection {
  id: string;
  label: string;
  isOrgSection?: boolean;
  groups: NavGroup[];
}

const ORG_ADMINS: readonly OrganizationRole[] = ["owner", "security_admin"];
const REPORT_WORKERS: readonly OrganizationRole[] = ["owner", "security_admin", "program_manager", "triager"];
const BILLING_ROLES: readonly OrganizationRole[] = ["owner", "security_admin", "billing_admin"];

// Account menu links
const ACCOUNT_MENU_LINKS: { href: Route; label: string; icon: LucideIcon }[] = [
  { href: "/profile" as Route, label: "Profile", icon: User },
  { href: "/settings" as Route, label: "Account settings", icon: Settings },
  { href: "/help" as Route, label: "Help & documentation", icon: HelpCircle },
];

/**
 * Builds the enterprise organization navigation hierarchy with 10 structured groups:
 * 1. Overview & Core Workspaces
 * 2. Team & Access
 * 3. Security
 * 4. Integrations
 * 5. Automation
 * 6. Billing
 * 7. Audit
 * 8. Branding
 * 9. Trust Center
 * 10. Settings
 */
function buildOrgNavGroups(orgId: string, role?: OrganizationRole): NavGroup[] {
  const base = `/organizations/${orgId}`;

  const allGroups: NavGroup[] = [
    // 1. Overview & Core Operational Workspaces
    {
      id: "org-workspace",
      label: "Workspace",
      icon: LayoutDashboard,
      defaultOpen: true,
      items: [
        { href: base as Route, label: "Overview", icon: LayoutDashboard, exact: true },
        { href: `${base}/programs` as Route, label: "Engagements", icon: Briefcase, badge: "Live", roles: REPORT_WORKERS },
        { href: `${base}/findings` as Route, label: "Findings", icon: Bug, roles: REPORT_WORKERS },
        { href: `${base}/assets` as Route, label: "Attack Surface", icon: Target, roles: REPORT_WORKERS },
        { href: `${base}/researchers` as Route, label: "Researchers", icon: Users, roles: ["owner", "security_admin", "program_manager"] },
        { href: `${base}/analytics` as Route, label: "Analytics", icon: BarChart3, roles: ORG_ADMINS },
        { href: `${base}/managed-triage` as Route, label: "Managed Triage", icon: Headphones, roles: ORG_ADMINS },
      ],
    },
    // 2. Team & Access
    {
      id: "org-team-access",
      label: "Team & Access",
      icon: UserCheck,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/members` as Route, label: "Members", icon: Users, exact: true },
        { href: `${base}/members?tab=roles` as Route, label: "Roles & Permissions", icon: Shield },
        { href: `${base}/members?tab=teams` as Route, label: "Teams & Groups", icon: Users },
        { href: `${base}/members?tab=invitations` as Route, label: "Invitations", icon: Mail },
        { href: `${base}/members?tab=sso` as Route, label: "SSO & SAML", icon: Lock },
        { href: `${base}/members?tab=scim` as Route, label: "SCIM Provisioning", icon: UserCheck },
        { href: `${base}/members?tab=api-tokens` as Route, label: "API Tokens", icon: KeyRound },
      ],
    },
    // 3. Security
    {
      id: "org-security",
      label: "Security",
      icon: ShieldCheck,
      roles: REPORT_WORKERS,
      items: [
        { href: `${base}/security` as Route, label: "Security Command Center", icon: ShieldCheck, exact: true },
        { href: `${base}/security?tab=integrity` as Route, label: "Scope Integrity & Shield", icon: ShieldAlert },
        { href: `${base}/security?tab=dns` as Route, label: "DNS Verification", icon: Globe },
        { href: `${base}/assets?status=pending` as Route, label: "Asset Approval", icon: CheckCircle2 },
        { href: `${base}/security?tab=policies` as Route, label: "Policies & Scope", icon: FileText },
        { href: `${base}/assets?view=ownership` as Route, label: "Ownership Review", icon: ShieldCheck },
      ],
    },
    // 4. Integrations
    {
      id: "org-integrations",
      label: "Integrations",
      icon: Plug,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/integrations` as Route, label: "All Integrations", icon: Plug, exact: true },
        { href: `${base}/integrations?app=jira` as Route, label: "Jira Software", icon: Layers },
        { href: `${base}/integrations?app=slack` as Route, label: "Slack & Teams", icon: MessageSquare },
        { href: `${base}/integrations?app=servicenow` as Route, label: "ServiceNow", icon: Building2 },
        { href: `${base}/integrations?app=github` as Route, label: "GitHub & GitLab", icon: FolderGit2 },
        { href: `${base}/integrations?tab=webhooks` as Route, label: "Webhooks", icon: Globe },
      ],
    },
    // 5. Automation
    {
      id: "org-automation",
      label: "Automation",
      icon: Zap,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/automation` as Route, label: "Automation Center", icon: Zap, exact: true },
        { href: `${base}/automation?tab=builder` as Route, label: "Workflow Builder", icon: GitBranch },
        { href: `${base}/automation?tab=templates` as Route, label: "Templates Library", icon: Sparkles },
        { href: `${base}/automation?tab=history` as Route, label: "Execution History", icon: History },
        { href: `${base}/automation?tab=approvals` as Route, label: "Approval Chains", icon: CheckCircle2 },
        { href: `${base}/automation?tab=analytics` as Route, label: "Workflow Analytics", icon: BarChart3 },
      ],
    },
    // 6. Billing & Finance
    {
      id: "org-billing",
      label: "Billing & Finance",
      icon: CreditCard,
      roles: BILLING_ROLES,
      items: [
        { href: `${base}/payments` as Route, label: "Financial Command Center", icon: CreditCard, exact: true },
        { href: `${base}/payments?tab=subscription` as Route, label: "Subscription & Plan", icon: Award },
        { href: `${base}/payments?tab=budget` as Route, label: "Reward Budgets", icon: PieChart },
        { href: `${base}/payments?tab=payments` as Route, label: "Researcher Payments", icon: Coins },
        { href: `${base}/payments?tab=invoices` as Route, label: "Invoices & Documents", icon: Receipt },
        { href: `${base}/payments?tab=tax` as Route, label: "Tax & Compliance", icon: FileText },
        { href: `${base}/payments?tab=analytics` as Route, label: "Cost Analytics & Forecast", icon: BarChart3 },
      ],
    },
    // 7. Audit & Compliance
    {
      id: "org-audit",
      label: "Audit",
      icon: FileText,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/activity` as Route, label: "Activity Log", icon: History, exact: true },
        { href: `${base}/activity?type=security` as Route, label: "Security Events", icon: ShieldCheck },
        { href: `${base}/activity?type=login` as Route, label: "Login History", icon: UserCheck },
        { href: `${base}/activity?type=api` as Route, label: "API Activity", icon: KeyRound },
        { href: `${base}/activity?view=export` as Route, label: "Export History", icon: FileText },
      ],
    },
    // 8. Branding
    {
      id: "org-branding",
      label: "Branding",
      icon: Palette,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/branding` as Route, label: "Brand Center", icon: Palette, exact: true },
        { href: `${base}/branding?tab=identity` as Route, label: "Organization Identity", icon: Building2 },
        { href: `${base}/branding?tab=assets` as Route, label: "Visual Assets & Logos", icon: Layers },
        { href: `${base}/branding?tab=public-profile` as Route, label: "Public Profile", icon: Globe },
        { href: `${base}/branding?tab=hall-of-fame` as Route, label: "Hall of Fame Branding", icon: Trophy },
        { href: `${base}/branding?tab=disclosure` as Route, label: "Disclosure & Safe Harbor", icon: Lock },
        { href: `${base}/branding?tab=email` as Route, label: "Email Branding", icon: Mail },
        { href: `${base}/branding?tab=preview` as Route, label: "Live Brand Preview", icon: Sparkles },
      ],
    },
    // 9. Trust Center
    {
      id: "org-trust-center",
      label: "Trust Center",
      icon: BadgeCheck,
      roles: REPORT_WORKERS,
      items: [
        { href: `${base}/trust` as Route, label: "Trust Center Console", icon: BadgeCheck, exact: true },
        { href: `${base}/trust?tab=dns` as Route, label: "Verified Domains & DNS", icon: Globe },
        { href: `${base}/trust?tab=workspace` as Route, label: "Ownership Workspace", icon: Layers },
        { href: `${base}/trust?tab=queue` as Route, label: "Manual Review Queue", icon: FileText },
        { href: `${base}/trust?tab=compliance` as Route, label: "Compliance & SLAs", icon: BadgeCheck },
      ],
    },
    // 10. Settings
    {
      id: "org-settings",
      label: "Settings",
      icon: Settings,
      roles: ORG_ADMINS,
      items: [
        { href: `${base}/settings` as Route, label: "General & Regional", icon: Settings, exact: true },
        { href: `${base}/settings?tab=program-defaults` as Route, label: "Program Defaults", icon: Sliders },
        { href: `${base}/settings?tab=feature-flags` as Route, label: "Feature Flags", icon: Zap },
        { href: `${base}/settings?tab=api-developer` as Route, label: "API & Developer", icon: KeyRound },
        { href: `${base}/settings?tab=data-management` as Route, label: "Data & Privacy", icon: Lock },
        { href: `${base}/settings?tab=danger` as Route, label: "Danger Zone", icon: AlertOctagon },
      ],
    },
  ];

  // Filter groups and sub-items based on user's authorized role
  return allGroups
    .filter((group) => !group.roles || (role !== undefined && group.roles.includes(role)))
    .map((group) => ({
      ...group,
      items: group.items?.filter((sub) => !sub.roles || (role !== undefined && sub.roles.includes(role))),
    }));
}

// Researcher navigation sections
const RESEARCH_GROUPS: NavGroup[] = [
  {
    id: "research",
    label: "Research Hub",
    icon: Crosshair,
    defaultOpen: true,
    items: [
      { href: "/" as Route, label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/programs" as Route, label: "Programs", icon: Crosshair },
      { href: "/reports" as Route, label: "Reports", icon: Bug },
      { href: "/researchers" as Route, label: "Researchers", icon: Users },
      { href: "/recognition" as Route, label: "Recognition", icon: Award },
    ],
  },
  {
    id: "practice",
    label: "Skill & Practice",
    icon: Flag,
    items: [
      { href: "/ctf" as Route, label: "CTF Challenges", icon: Flag, badge: MOCK_CTF_CHALLENGES.length.toString() },
      { href: "/learn" as Route, label: "Learning Center", icon: BookOpen, badge: TRAINING_ARTICLES.length.toString() },
    ],
  },
  {
    id: "community",
    label: "Community",
    icon: Trophy,
    items: [
      { href: "/events" as Route, label: "Security Events", icon: Calendar },
      { href: "/mentorship" as Route, label: "Mentorship", icon: GraduationCap },
      { href: "/hall-of-fame" as Route, label: "Hall of Fame", icon: Trophy },
    ],
  },
  {
    id: "record",
    label: "Earnings & Records",
    icon: Coins,
    items: [
      { href: "/bounties" as Route, label: "Bounty Payouts", icon: Coins },
      { href: "/bounties/documents" as Route, label: "Tax & Documents", icon: FileText },
    ],
  },
];

// Platform Admin navigation groups
const PLATFORM_GROUPS: NavGroup[] = [
  {
    id: "platform-ops",
    label: "Platform Operations",
    icon: ShieldCheck,
    defaultOpen: true,
    items: [
      { href: "/platform" as Route, label: "Overview", icon: LayoutDashboard, exact: true },
      { href: "/platform/all-programs" as Route, label: "All Programs", icon: ListFilter },
      { href: "/platform/programs" as Route, label: "Program Launches", icon: Briefcase },
      { href: "/platform/scope-review" as Route, label: "Scope Review", icon: BadgeCheck },
      { href: "/platform/organizations" as Route, label: "Organizations", icon: Building2 },
      { href: "/platform/managed-triage" as Route, label: "Managed Triage", icon: Headphones },
      { href: "/platform/researchers" as Route, label: "Researchers", icon: Users },
      { href: "/platform/payouts" as Route, label: "Payouts", icon: Wallet },
      { href: "/platform/mediations" as Route, label: "Mediations", icon: Scale },
      { href: "/platform/audit-log" as Route, label: "Audit Log", icon: FileText },
    ],
  },
];

type NavContext = {
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  hasResearcherParticipation: boolean;
  isPlatformAdmin: boolean;
  platformAdminNeedsMfa: boolean;
  isTriageAnalyst: boolean;
  pathname: string;
};

/**
 * Checks if a given item matches the current active pathname
 */
function isHrefActive(href: string, exact: boolean | undefined, currentPath: string): boolean {
  const [basePath, query] = href.split("?");
  if (query) {
    return currentPath === href;
  }
  if (exact) {
    return currentPath === basePath;
  }
  return currentPath === basePath || currentPath.startsWith(`${basePath}/`);
}

/**
 * Enterprise Organization Switcher Dropdown
 */
function OrganizationSwitcher({
  organizations,
  currentOrganizationId,
  collapsed = false,
  onExpand,
}: {
  organizations: OrganizationSummary[];
  currentOrganizationId?: string;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = organizations.find((org) => org.id === currentOrganizationId) ?? organizations[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!current) return null;

  const initial = current.name.trim().charAt(0).toUpperCase();

  // In collapsed rail mode, render compact org mark button
  if (collapsed) {
    return (
      <div className="relative flex justify-center py-1">
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Current organization: ${current.name}. Click to expand sidebar.`}
          data-rail-label={current.name}
          className="group relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-xs font-bold text-white shadow-sm ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
        >
          {initial}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[#FCFCFD]",
              current.status === "active" ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative mb-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="group flex w-full items-center gap-2.5 rounded-xl border border-[#E7EAF0] bg-white p-2 text-left shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all hover:border-[#D0D5DD] hover:bg-[#F9FAFB] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
      >
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#1E293B] to-[#0F172A] text-xs font-bold text-white shadow-sm ring-1 ring-black/10">
          {initial}
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-1.5 ring-white",
              current.status === "active" ? "bg-emerald-500" : "bg-amber-500",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold text-[#111827]">{current.name}</span>
            <CheckCircle2 className="size-3.5 shrink-0 text-blue-600" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="rounded bg-blue-50 px-1 py-0.2 text-[10px] font-medium text-blue-700 border border-blue-200/50">
              Enterprise
            </span>
            <span className="truncate text-[11px] text-[#667085] capitalize">
              {current.role ? current.role.replace("_", " ") : "Member"}
            </span>
          </div>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-[#98A2B3] transition-colors group-hover:text-[#475467]" />
      </button>

      {/* Switcher Dropdown Popover */}
      {open && (
        <div
          role="menu"
          aria-label="Switch organization"
          className="absolute left-0 top-full z-40 mt-1.5 w-full min-w-64 rounded-xl border border-[#E7EAF0] bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3]">
            Your Organizations ({organizations.length})
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {organizations.map((org) => {
              const isSelected = org.id === current.id;
              const orgInitial = org.name.trim().charAt(0).toUpperCase();
              return (
                <button
                  key={org.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/organizations/${org.id}` as Route);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition-all",
                    isSelected
                      ? "bg-blue-50/80 font-medium text-blue-900"
                      : "text-[#344054] hover:bg-[#F4F6F8] hover:text-[#111827]",
                  )}
                >
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-[#1E293B] text-[10px] font-bold text-white">
                    {orgInitial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{org.name}</div>
                    <div className="text-[11px] text-[#667085]">@{org.slug}</div>
                  </div>
                  {isSelected && <Check className="size-4 shrink-0 text-blue-600" />}
                </button>
              );
            })}
          </div>

          <div className="my-1 border-t border-[#E7EAF0]" />

          <Link
            href={"/organizations" as Route}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#475467] hover:bg-[#F4F6F8] hover:text-[#111827]"
          >
            <Building2 className="size-4 shrink-0 text-[#667085]" />
            Manage all organizations
          </Link>
          <Link
            href={"/" as Route}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          >
            <Crosshair className="size-4 shrink-0 text-blue-600" />
            Switch to Researcher View
          </Link>
        </div>
      )}
    </div>
  );
}

/**
 * Enterprise Collapsible Navigation Group Component
 */
function CollapsibleNavGroup({
  group,
  pathname,
  collapsed,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const GroupIcon = group.icon;

  // Determine if this group contains the active item
  const hasActiveItem = useMemo(() => {
    if (group.href && isHrefActive(group.href, group.exact, pathname)) return true;
    return group.items?.some((sub) => isHrefActive(sub.href, sub.exact, pathname)) ?? false;
  }, [group, pathname]);

  const [isOpen, setIsOpen] = useState(group.defaultOpen || hasActiveItem);

  // Auto-expand if the route changes to an item in this group
  useEffect(() => {
    if (hasActiveItem) {
      setIsOpen(true);
    }
  }, [hasActiveItem]);

  // If group has no sub-items, render as a direct navigation row
  if (!group.items || group.items.length === 0) {
    if (!group.href) return null;
    const active = isHrefActive(group.href, group.exact, pathname);
    return (
      <Link
        href={group.href}
        prefetch={false}
        onClick={onNavigate}
        data-rail-label={group.label}
        className={cn(
          "group relative flex h-8 items-center gap-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
          collapsed ? "mx-auto w-8 justify-center" : "px-2.5",
          active
            ? "bg-white font-semibold text-[#111827] shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-[#E7EAF0]"
            : "text-[#475467] hover:bg-[#F4F6F8] hover:text-[#111827]",
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#2563EB]"
          />
        )}
        <GroupIcon
          className={cn(
            "size-4 shrink-0 transition-colors",
            active ? "text-[#2563EB]" : "text-[#667085] group-hover:text-[#111827]",
          )}
        />
        {!collapsed && <span className="min-w-0 flex-1 truncate">{group.label}</span>}
        {group.badge && !collapsed && (
          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.2 text-[11px] font-medium text-slate-600">
            {group.badge}
          </span>
        )}
      </Link>
    );
  }

  // Collapsed rail mode: show group icon button
  if (collapsed) {
    const active = hasActiveItem;
    return (
      <div className="relative my-0.5">
        <Link
          href={group.items[0]?.href ?? ("#" as Route)}
          prefetch={false}
          onClick={onNavigate}
          data-rail-label={group.label}
          className={cn(
            "group relative flex size-8 items-center justify-center rounded-lg text-[13px] font-medium transition-all duration-150",
            active
              ? "bg-white font-semibold text-[#111827] shadow-[0_1px_3px_rgba(16,24,40,0.06)] ring-1 ring-[#E7EAF0]"
              : "text-[#475467] hover:bg-[#F4F6F8] hover:text-[#111827]",
          )}
        >
          {active && (
            <span
              aria-hidden="true"
              className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#2563EB]"
            />
          )}
          <GroupIcon
            className={cn(
              "size-4 shrink-0 transition-colors",
              active ? "text-[#2563EB]" : "text-[#667085] group-hover:text-[#111827]",
            )}
          />
        </Link>
      </div>
    );
  }

  // Expanded mode: render group header and collapsible sub-items
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={cn(
          "group flex h-8 w-full items-center justify-between rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors",
          hasActiveItem
            ? "text-[#111827] font-semibold"
            : "text-[#475467] hover:bg-[#F4F6F8] hover:text-[#111827]",
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <GroupIcon
            className={cn(
              "size-4 shrink-0 transition-colors",
              hasActiveItem ? "text-[#2563EB]" : "text-[#667085] group-hover:text-[#111827]",
            )}
          />
          <span className="truncate">{group.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {group.badge && (
            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-600">
              {group.badge}
            </span>
          )}
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-[#98A2B3] transition-transform duration-200 group-hover:text-[#475467]",
              isOpen && "rotate-90",
            )}
          />
        </div>
      </button>

      {/* Sub-items List with Sleek Left Indentation Guide */}
      {isOpen && (
        <div className="relative ml-4 pl-3.5 border-l border-[#E7EAF0] my-0.5 space-y-0.5 py-0.5">
          {group.items.map((item) => {
            const active = isHrefActive(item.href, item.exact, pathname);
            const SubIcon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                onClick={onNavigate}
                className={cn(
                  "group/sub relative flex h-7 items-center justify-between rounded-md px-2 text-[12.5px] transition-all",
                  active
                    ? "bg-blue-50/70 font-semibold text-[#1D4ED8]"
                    : "text-[#475467] hover:bg-[#F4F6F8] hover:text-[#111827]",
                )}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[15px] top-1 bottom-1 w-[2px] rounded-r-full bg-[#2563EB]"
                  />
                )}
                <div className="flex min-w-0 items-center gap-2">
                  {SubIcon && (
                    <SubIcon
                      className={cn(
                        "size-3.5 shrink-0 transition-colors",
                        active ? "text-[#2563EB]" : "text-[#98A2B3] group-hover/sub:text-[#475467]",
                      )}
                    />
                  )}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.2 text-[10px] font-medium",
                      active ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-[#667085]",
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Account Menu Dropdown Items
 */
function AccountMenuItems({ user }: { user: ShellUser }) {
  return (
    <div className="w-56 p-1">
      <div className="px-2.5 py-2">
        <p className="text-[13px] font-semibold text-[#111827]">{user.displayName}</p>
        {user.email && <p className="truncate text-xs text-[#667085]">{user.email}</p>}
      </div>
      <div className="my-1 border-t border-[#E7EAF0]" />
      {ACCOUNT_MENU_LINKS.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className="flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-[#344054] hover:bg-[#F4F6F8] hover:text-[#111827]"
          >
            <Icon className="size-4 shrink-0 text-[#667085]" />
            {item.label}
          </Link>
        );
      })}
      <div className="my-1 border-t border-[#E7EAF0]" />
      <SignOutForm buttonClassName="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] text-red-600 hover:bg-red-50 hover:text-red-700" />
    </div>
  );
}

/**
 * Top brand header
 */
function BrandHeader({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      prefetch={false}
      aria-label="Com Olho Unpatched"
      className="flex items-center gap-2.5 px-1 py-1 focus-visible:outline-2 focus-visible:outline-[#2563EB]"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#2563EB] text-white shadow-sm">
        <ShieldCheck className="size-4" />
      </div>
      <div className={cn("flex flex-col min-w-0", compact && "hidden min-[400px]:flex")}>
        <span className="truncate text-[14px] font-bold tracking-tight text-[#111827]">
          Unpatched
        </span>
        <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[#98A2B3]">
          Security Platform
        </span>
      </div>
    </Link>
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
  isTriageAnalyst = false,
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
  isTriageAnalyst?: boolean;
  initialSidebarCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed);
  const [railTip, setRailTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const reducedMotion = usePrefersReducedMotion();

  // Determine active organization context
  const isOrgRoute = pathname.startsWith("/organizations");
  const hasOrganizations = organizations.length > 0;
  const currentOrg = organizations.find((org) => org.id === currentOrganizationId) ?? organizations[0];
  const orgRole = currentOrg?.role;

  // Toggle collapsed state and save to cookie
  const toggleSidebar = useCallback(() => {
    setRailTip(null);
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  const closeDrawer = () => setMobileDrawerOpen(false);

  // Keyboard navigation & accessibility
  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileDrawerOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileDrawerOpen]);

  // Build appropriate navigation groups
  const navGroups = useMemo(() => {
    if (isPlatformAdmin) return PLATFORM_GROUPS;
    if (currentOrg && (isOrgRoute || !hasResearcherParticipation)) {
      return buildOrgNavGroups(currentOrg.id, orgRole);
    }
    return RESEARCH_GROUPS;
  }, [isPlatformAdmin, currentOrg, isOrgRoute, hasResearcherParticipation, orgRole]);

  // Filter groups if search query is entered
  const filteredGroups = useMemo<NavGroup[]>(() => {
    if (!searchQuery.trim()) return navGroups;
    const query = searchQuery.toLowerCase();
    const result: NavGroup[] = [];
    for (const group of navGroups) {
      const matchingItems = group.items?.filter((item) => item.label.toLowerCase().includes(query));
      const groupMatches = group.label.toLowerCase().includes(query);
      if (groupMatches || (matchingItems && matchingItems.length > 0)) {
        result.push({
          ...group,
          defaultOpen: true,
          items: groupMatches ? group.items : matchingItems,
        });
      }
    }
    return result;
  }, [navGroups, searchQuery]);

  const showRailTip = (target: EventTarget | null) => {
    const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-rail-label]");
    if (!el) return setRailTip(null);
    const rect = el.getBoundingClientRect();
    setRailTip({ label: el.dataset.railLabel ?? "", top: rect.top + rect.height / 2, left: rect.right + 10 });
  };

  const roleBadgeLabel = isPlatformAdmin
    ? "Platform Admin"
    : isTriageAnalyst
    ? "Triage Analyst"
    : isOrgRoute && orgRole
    ? orgRole.replace("_", " ")
    : "Researcher";

  const renderNavContent = (isDrawer = false) => {
    const isRail = !isDrawer && collapsed;

    return (
      <div className="flex h-full flex-col">
        {/* Top Header / Account / Brand */}
        <div className="flex items-center justify-between pb-3">
          <BrandHeader compact={isRail} />
          {!isRail && (
            <div className="flex items-center gap-1">
              <NotificationBellDropdown initialUnreadCount={unreadNotificationCount} align="left" />
              {!isDrawer && (
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-[#667085] hover:bg-[#F4F6F8] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-[#2563EB]"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Organization Switcher (when user belongs to organizations) */}
        {hasOrganizations && (
          <OrganizationSwitcher
            organizations={organizations}
            currentOrganizationId={currentOrg?.id}
            collapsed={isRail}
            onExpand={toggleSidebar}
          />
        )}

        {/* Global Search / Jump-to filter */}
        {!isRail ? (
          <div className="relative mb-3">
            <div className="flex h-8.5 items-center gap-2 rounded-lg border border-[#E7EAF0] bg-white px-2.5 text-xs text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,0.02)] transition-all focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-blue-500/10">
              <Search className="size-3.5 shrink-0 text-[#98A2B3]" />
              <input
                suppressHydrationWarning
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Jump to or search..."
                className="w-full bg-transparent text-[12.5px] text-[#111827] placeholder:text-[#98A2B3] focus:outline-none"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="rounded p-0.5 text-[#98A2B3] hover:text-[#111827]"
                >
                  <X className="size-3" />
                </button>
              ) : (
                <kbd className="hidden rounded bg-[#F4F6F8] border border-[#E7EAF0] px-1.5 py-0.5 font-mono text-[10px] text-[#98A2B3] min-[1280px]:inline">
                  ⌘K
                </kbd>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={toggleSidebar}
            data-rail-label="Search"
            className="mx-auto mb-3 flex size-8 items-center justify-center rounded-lg border border-[#E7EAF0] bg-white text-[#667085] hover:border-[#D0D5DD] hover:text-[#111827]"
          >
            <Search className="size-4" />
          </button>
        )}

        {/* Main Navigation Items Tree */}
        <div className="flex-1 overflow-y-auto pr-0.5 space-y-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filteredGroups.map((group) => (
            <CollapsibleNavGroup
              key={group.id}
              group={group}
              pathname={pathname}
              collapsed={isRail}
              onNavigate={isDrawer ? closeDrawer : () => {}}
            />
          ))}

          {/* Context Switching Banner (if researcher in org, or org member in researcher view) */}
          {!isRail && hasOrganizations && hasResearcherParticipation && (
            <div className="pt-4 pb-2">
              <div className="rounded-xl border border-[#E7EAF0] bg-white p-2.5 shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
                <div className="text-[11px] font-semibold text-[#475467] mb-1">Context Switch</div>
                {isOrgRoute ? (
                  <Link
                    href={"/" as Route}
                    prefetch={false}
                    className="flex items-center justify-between text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <span>Go to Researcher Hub</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                ) : (
                  <Link
                    href={`/organizations/${currentOrg.id}` as Route}
                    prefetch={false}
                    className="flex items-center justify-between text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    <span>Go to {currentOrg.name}</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Account & User Bar */}
        <div className="mt-auto border-t border-[#E7EAF0] pt-3">
          {user ? (
            <DropdownMenu
              menuLabel="Account"
              align="left"
              className={isRail ? "mx-auto" : "w-full"}
              triggerClassName={cn(
                "flex h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left hover:bg-[#F4F6F8] focus-visible:outline-2 focus-visible:outline-[#2563EB]",
                isRail && "justify-center px-0 w-8",
              )}
              label={
                <>
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-xs text-white shadow-sm">
                    {user.displayName.trim().charAt(0).toUpperCase() || "U"}
                  </div>
                  {!isRail && (
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[#111827]">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-[11px] text-[#667085] capitalize">
                        {roleBadgeLabel}
                      </span>
                    </div>
                  )}
                  {!isRail && <ChevronDown className="size-3.5 shrink-0 text-[#98A2B3]" />}
                </>
              }
            >
              <AccountMenuItems user={user} />
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2 p-2 text-xs text-[#667085]">
              <User className="size-4" />
              {!isRail && <span>Signed Out</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-dvh bg-[#F6F8FB] text-[#111827]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:outline-2 focus:outline-[#2563EB]"
      >
        Skip to content
      </a>

      {/* Mobile Top Bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#E7EAF0] bg-white/95 px-3 backdrop-blur lg:hidden">
        <IconButton label="Open navigation" variant="quiet" className="shrink-0" onClick={() => setMobileDrawerOpen(true)}>
          <Menu className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1 px-2">
          <BrandHeader compact />
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={"/search" as Route}
            prefetch={false}
            aria-label="Search"
            className="inline-flex size-9 items-center justify-center rounded-lg text-[#667085] hover:bg-[#F4F6F8] hover:text-[#111827]"
          >
            <Search className="size-4.5" />
          </Link>
          <NotificationBellDropdown initialUnreadCount={unreadNotificationCount} />
          {user && (
            <DropdownMenu
              menuLabel="Account"
              label={<Avatar name={user.displayName} />}
            >
              <AccountMenuItems user={user} />
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* Desktop Layout Grid */}
      <div
        className={cn(
          "lg:grid lg:transition-[grid-template-columns] lg:duration-200 lg:ease-in-out motion-reduce:transition-none",
          collapsed ? "lg:grid-cols-[3.5rem_minmax(0,1fr)]" : "lg:grid-cols-[16rem_minmax(0,1fr)]",
        )}
      >
        {/* Desktop Sidebar */}
        <aside
          id="desktop-sidebar"
          aria-label="Sidebar"
          onPointerOver={collapsed ? (event) => showRailTip(event.target) : undefined}
          onPointerLeave={() => setRailTip(null)}
          onFocus={collapsed ? (event) => showRailTip(event.target) : undefined}
          onBlur={() => setRailTip(null)}
          onScroll={() => setRailTip(null)}
          className={cn(
            "nav-scope sticky top-0 z-30 hidden h-dvh flex-col border-r border-[#E7EAF0] bg-[#FCFCFD] pb-3 pt-3 lg:flex",
            collapsed ? "px-2" : "px-3.5",
          )}
        >
          {renderNavContent(false)}
        </aside>

        {/* Rail Hover Tooltip */}
        {collapsed && railTip && (
          <span
            aria-hidden="true"
            style={{ top: railTip.top, left: railTip.left }}
            className="pointer-events-none fixed z-50 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-[#111827] px-2.5 py-1 text-xs font-medium text-white shadow-md lg:block"
          >
            {railTip.label}
          </span>
        )}

        {/* Mobile Slide-over Drawer */}
        <AnimatePresence>
          {mobileDrawerOpen && (
            <motion.div
              className="fixed inset-0 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.25 }}
            >
              <button
                type="button"
                aria-hidden="true"
                tabIndex={-1}
                className="absolute inset-0 bg-black/40 backdrop-blur-xs"
                onClick={closeDrawer}
              />
              <motion.aside
                initial={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)" }}
                animate={reducedMotion ? { opacity: 1 } : { transform: "translateX(0%)" }}
                exit={reducedMotion ? { opacity: 0 } : { transform: "translateX(-100%)" }}
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                className="nav-scope relative flex h-full w-76 flex-col overflow-y-auto bg-[#FCFCFD] p-3.5 shadow-2xl"
              >
                <div className="flex items-center justify-between pb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#98A2B3]">
                    Navigation
                  </span>
                  <IconButton label="Close navigation" variant="quiet" onClick={closeDrawer}>
                    <X className="size-5" />
                  </IconButton>
                </div>
                {renderNavContent(true)}
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main id="main" className="min-w-0 bg-[#F6F8FB]">
          {/* Top Page Breadcrumb / Title Strip */}
          <header className="sticky top-14 z-10 flex h-11 items-center border-b border-[#E7EAF0] bg-white/95 px-4 backdrop-blur sm:px-6 lg:top-0 lg:px-8">
            {titleIsSection ? (
              <p className="truncate text-[13.5px] font-semibold tracking-tight text-[#111827]">
                {title}
              </p>
            ) : (
              <h1 className="truncate text-[13.5px] font-semibold tracking-tight text-[#111827]">
                {title}
              </h1>
            )}
          </header>
          <div className="mx-auto max-w-[1440px] p-3 sm:p-4 lg:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}


