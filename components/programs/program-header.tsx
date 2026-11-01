"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  Pulse,
  BookOpenText,
  Bug,
  CaretUpDown,
  ChartBar,
  Check,
  GearSix,
  GitDiff,
  PlugsConnected,
  ShieldCheck,
  Tray,
  UsersThree,
} from "@phosphor-icons/react";
import { Separator } from "../ui/feedback";
import { cn } from "../../lib/cn";
import type { ProgramStatus, ProgramType } from "../../types/program";

export type ProgramSection =
  | "overview"
  | "reports"
  | "inbox"
  | "researchers"
  | "policies"
  | "integrations"
  | "operations"
  | "activity"
  | "analytics"
  | "scope"
  | "settings";

export type ProgramSwitcherEntry = {
  id: string;
  name: string;
  status: ProgramStatus;
};

export function ProgramSwitcher({
  organizationId,
  programId,
  programName,
  siblingPrograms,
}: {
  organizationId: string;
  programId: string;
  programName: string;
  siblingPrograms: ProgramSwitcherEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function handleSwitch(targetProgramId: string) {
    setOpen(false);
    if (targetProgramId === programId) return;
    router.push(
      `/organizations/${organizationId}/programs/${targetProgramId}` as Route,
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch program"
        className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-[#E7EAF0] bg-white px-2.5 text-[12px] font-medium text-[#475467] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 hover:border-[#D0D5DD] hover:bg-[#F8FAFC] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
      >
        <span>Switch</span>
        <CaretUpDown aria-hidden="true" className="size-3.5 shrink-0 text-[#667085]" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch program"
          className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-[14px] border border-[#E7EAF0] bg-white p-1.5 shadow-[0_20px_40px_rgba(16,24,40,0.12)]"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-semibold tracking-wider text-[#98A2B3] uppercase">
            Active Engagements
          </div>
          <button
            type="button"
            role="menuitemradio"
            aria-checked="true"
            className="flex min-h-10 w-full items-center gap-2 rounded-[10px] bg-[#F8FAFC] px-2.5 text-left text-[13px] font-semibold text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
          >
            <span className="size-2 shrink-0 rounded-full bg-[#12B76A]" />
            <span className="min-w-0 flex-1 truncate">{programName}</span>
            <Check aria-hidden="true" className="size-4 shrink-0 text-[#2563EB]" />
          </button>
          {siblingPrograms.length > 0 && <Separator className="my-1" />}
          {siblingPrograms.map((program) => (
            <button
              key={program.id}
              type="button"
              role="menuitemradio"
              aria-checked="false"
              onClick={() => handleSwitch(program.id)}
              className="flex min-h-10 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-medium text-[#475467] transition-colors hover:bg-[#F4F6F8] hover:text-[#111827] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  program.status === "active"
                    ? "bg-[#12B76A]"
                    : program.status === "paused"
                      ? "bg-[#F59E0B]"
                      : "bg-[#98A2B3]",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{program.name}</span>
            </button>
          ))}
          <Separator className="my-1" />
          <Link
            href={`/organizations/${organizationId}/programs` as Route}
            prefetch={false}
            onClick={() => setOpen(false)}
            className="flex min-h-9 w-full items-center gap-2 rounded-[10px] px-2.5 text-[12px] font-semibold text-[#2563EB] transition-colors hover:bg-[#EFF6FF] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]"
          >
            All engagements →
          </Link>
        </div>
      )}
    </div>
  );
}

export function ProgramHeader({
  organizationId,
  programId,
  programName,
  status,
  programType,
  active,
  canManage,
  canWorkReports = canManage,
  siblingPrograms,
  openReportsCount,
  researchersCount,
  hideIdentityRow = false,
}: {
  organizationId: string;
  programId: string;
  programName: string;
  status: ProgramStatus;
  programType?: ProgramType;
  active: ProgramSection;
  canManage: boolean;
  canWorkReports?: boolean;
  siblingPrograms?: ProgramSwitcherEntry[];
  openReportsCount?: number;
  researchersCount?: number;
  /** When rendered inside the full Program Operations Center hero, the hero itself renders the identity row. */
  hideIdentityRow?: boolean;
}) {
  const base = `/organizations/${organizationId}/programs/${programId}`;

  const items: {
    id: ProgramSection;
    label: string;
    href: Route;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    {
      id: "overview",
      label: "Overview",
      href: base as Route,
      icon: ShieldCheck,
    },
    ...(canWorkReports
      ? [
          {
            id: "reports" as const,
            label: "Reports",
            href: `${base}/reports` as Route,
            icon: Bug,
            badge: openReportsCount,
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: "researchers" as const,
            label: "Researchers",
            href: `${base}#researchers` as Route,
            icon: UsersThree,
            badge: researchersCount,
          },
        ]
      : []),
    {
      id: "policies",
      label: "Policies",
      href: `${base}#policies` as Route,
      icon: BookOpenText,
    },
    ...(canManage
      ? [
          {
            id: "integrations" as const,
            label: "Integrations",
            href: `${base}#integrations` as Route,
            icon: PlugsConnected,
          },
          {
            id: "operations" as const,
            label: "Operations",
            href: `${base}#scope` as Route,
            icon: GitDiff,
          },
          {
            id: "activity" as const,
            label: "Activity",
            href: `${base}#activity` as Route,
            icon: Pulse,
          },
          {
            id: "analytics" as const,
            label: "Analytics",
            href: `${base}#program-health` as Route,
            icon: ChartBar,
          },
        ]
      : [
          {
            id: "scope" as const,
            label: "Scope",
            href: `${base}#scope` as Route,
            icon: GitDiff,
          },
        ]),
    ...(canWorkReports
      ? [
          {
            id: "inbox" as const,
            label: "Inbox",
            href: `${base}/inbox` as Route,
            icon: Tray,
          },
        ]
      : []),
    ...(canManage
      ? [
          {
            id: "settings" as const,
            label: "Settings",
            href: `${base}/settings` as Route,
            icon: GearSix,
          },
        ]
      : []),
  ];

  const statusTone =
    status === "active"
      ? "border-[#A6F4C5] bg-[#ECFDF3] text-[#12B76A]"
      : status === "paused" || status === "review"
        ? "border-[#FEDF89] bg-[#FFFAEB] text-[#D97706]"
        : status === "suspended"
          ? "border-[#FECDCA] bg-[#FEF3F2] text-[#EF4444]"
          : "border-[#E7EAF0] bg-[#F8FAFC] text-[#475467]";

  return (
    <div className="border-b border-[#E7EAF0] bg-white px-4 pt-3 sm:px-5 rounded-t-[16px]">
      {!hideIdentityRow && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[11px] font-semibold tracking-wider text-[#667085] uppercase">
              Program Operations
            </span>
            <span className="text-[#D0D5DD]">/</span>
            <h2 className="text-[22px] font-bold tracking-tight text-[#111827] sm:text-[26px]">
              {programName}
            </h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium capitalize",
                statusTone,
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "active"
                    ? "bg-[#12B76A]"
                    : status === "paused" || status === "review"
                      ? "bg-[#F59E0B]"
                      : status === "suspended"
                        ? "bg-[#EF4444]"
                        : "bg-[#98A2B3]",
                )}
              />
              {status}
            </span>
            {programType === "vdp" ? (
              <span className="rounded-full border border-[#E7EAF0] bg-[#F8FAFC] px-2.5 py-0.5 text-[12px] font-medium text-[#475467]">
                VDP Disclosure
              </span>
            ) : (
              <span className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 py-0.5 text-[12px] font-medium text-[#2563EB]">
                Continuous Bounty
              </span>
            )}
            {siblingPrograms && (
              <ProgramSwitcher
                organizationId={organizationId}
                programId={programId}
                programName={programName}
                siblingPrograms={siblingPrograms}
              />
            )}
          </div>
        </div>
      )}

      <nav
        aria-label="Program sections"
        className="-mb-px flex items-center gap-1 overflow-x-auto"
      >
        {items.map((item) => {
          const Icon = item.icon;
          const isCurrent = active === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              aria-current={isCurrent ? "page" : undefined}
              className={cn(
                "group relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2563EB]",
                isCurrent
                  ? "border-[#2563EB] font-semibold text-[#111827]"
                  : "border-transparent text-[#667085] hover:border-[#D0D5DD] hover:text-[#111827]",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  isCurrent
                    ? "text-[#2563EB]"
                    : "text-[#98A2B3] group-hover:text-[#475467]",
                )}
              />
              <span>{item.label}</span>
              {typeof item.badge === "number" && (
                <span
                  className={cn(
                    "ml-0.5 inline-flex items-center justify-center rounded-full px-1.5 py-0.2 font-mono text-[11px] font-medium tabular-nums",
                    isCurrent
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "bg-[#F4F6F8] text-[#475467]",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
