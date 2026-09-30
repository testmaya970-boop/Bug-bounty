import React from "react";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import type { Route } from "next";
import { AppShell } from "../../../components/app-shell";
import { SectionLabel } from "../../../components/ui/security-primitives";
import { EmptyState } from "../../../components/ui/feedback";
import { Button } from "../../../components/ui/button";
import { Input, Select } from "../../../components/ui/form";
import { ProgramStatusBadge } from "../../../components/ui/badge";
import { ProgramSuspensionControl } from "../../../components/platform/program-suspension-control";
import { getProgramDirectoryForAdmin, isPlatformAdmin } from "../../../services/platform-operations";
import { getCurrentUser } from "../../../lib/auth/current-user";
import { engagementTypeLabel, programStatusLabel } from "../../../lib/program-status";
import { cn } from "../../../lib/cn";
import type { ProgramStatus } from "../../../types/program";
import { LocalTime } from "../../../components/ui/local-time";

// Operator order: what's live first, then what needs a decision, then what's stopped.
const STATUS_ORDER: ProgramStatus[] = ["active", "paused", "review", "draft", "suspended", "closed"];

function directoryHref(params: { q?: string; status?: ProgramStatus }): Route {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  const query = search.toString();
  return `/platform/all-programs${query ? `?${query}` : ""}` as Route;
}

/**
 * Every program on the platform, across every organization: counts by status, search by
 * program/org name or slug, and per-row suspend/reinstate. Non-admins get a 404, same as
 * every other /platform/* page. See db/migrations/202609250003_platform_program_oversight.sql.
 */
export default async function PlatformAllProgramsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirectTo=/platform/all-programs" as Route);

  const admin = await isPlatformAdmin();
  if (!admin) notFound();

  const params = await searchParams;
  const q = params.q?.trim() || undefined;
  const status = STATUS_ORDER.includes(params.status as ProgramStatus) ? (params.status as ProgramStatus) : undefined;

  const { counts, programs } = await getProgramDirectoryForAdmin({ search: q, status });
  const total = STATUS_ORDER.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

  return (
    <AppShell title="All programs" user={user}>
      <div className="max-w-6xl space-y-6">
        <div>
          <SectionLabel>Platform operations</SectionLabel>
          <p className="mt-1 text-sm text-ink-muted">Every program across every organization. Suspend a live program to pull it from researchers and stop new reports.</p>
        </div>

        <nav aria-label="Filter by status" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {[undefined, ...STATUS_ORDER].map((s) => {
            const selected = s === status;
            const count = s ? (counts[s] ?? 0) : total;
            return (
              <Link
                key={s ?? "all"}
                prefetch={false}
                href={directoryHref({ q, status: s })}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "rounded-lg border bg-surface p-4 transition-colors duration-150 ease-out hover:border-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  selected ? "border-action" : "border-border",
                )}
              >
                <SectionLabel className={s === "suspended" && count > 0 ? "text-danger" : undefined}>{s ? programStatusLabel(s) : "All programs"}</SectionLabel>
                <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{count.toLocaleString("en-US")}</p>
              </Link>
            );
          })}
        </nav>

        <form method="get" action="/platform/all-programs" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
          <Input label="Search programs" name="q" defaultValue={q} placeholder="Program, organization name or slug" className="min-w-64 flex-1" />
          <Select label="Status" name="status" defaultValue={status ?? ""} className="w-44">
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {programStatusLabel(s)}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {(q || status) && (
            <Link prefetch={false} href={"/platform/all-programs" as Route} className="min-h-11 content-center text-sm font-medium text-action hover:underline">
              Clear
            </Link>
          )}
        </form>

        {programs.length === 0 ? (
          <EmptyState title="No matching programs">{q || status ? "No program matches these filters." : "No program has been created on the platform yet."}</EmptyState>
        ) : (
          <div className="relative overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <caption className="sr-only">Programs{status ? `, status ${programStatusLabel(status)}` : ""}{q ? `, matching "${q}"` : ""}</caption>
              <thead className="border-b border-border text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Program</th>
                  <th scope="col" className="px-4 py-3">Organization</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Type</th>
                  <th scope="col" className="px-4 py-3 text-right">Reports</th>
                  <th scope="col" className="px-4 py-3">Last updated</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {programs.map((program) => (
                  <tr key={program.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{program.name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{program.visibility === "public" ? "Public" : "Private"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink">{program.organizationName}</p>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">{program.organizationSlug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <ProgramStatusBadge status={program.status} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {engagementTypeLabel(program.engagementType)} · {program.programType === "vdp" ? "VDP" : "Paid bounty"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">{program.reportCount.toLocaleString("en-US")}</td>
                    <td className="px-4 py-3 text-ink-muted"><LocalTime value={program.updatedAt} /></td>
                    <td className="px-4 py-3 text-right">
                      <ProgramSuspensionControl programId={program.id} programName={program.name} status={program.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {programs.length === 200 && <p className="border-t border-border px-4 py-3 text-xs text-ink-muted">Showing the 200 most recently updated matches. Narrow the search to see others.</p>}
          </div>
        )}
      </div>
    </AppShell>
  );
}
