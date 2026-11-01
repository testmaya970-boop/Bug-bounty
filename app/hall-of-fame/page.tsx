import React from "react";
import Link from "next/link";
import type { Metadata, Route } from "next";
import { SimplePageShell } from "../../components/simple-page-shell";
import { EmptyState } from "../../components/ui/feedback";
import { LocalTime } from "../../components/ui/local-time";
import { getCurrentUser } from "../../lib/auth/current-user";
import { listHallOfFame } from "../../services/researcher-journey";

export const metadata: Metadata = { title: "Hall of Fame | Unpatched", description: "Researchers publicly thanked by organizations on Unpatched." };

/** Public (202610280001): researchers organizations thanked, who agreed to be named. Public live
 * programs only, and never anything about the finding itself. ?program= narrows to one program. */
export default async function HallOfFamePage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const { program } = await searchParams;
  const programId = program && /^[0-9a-f-]{36}$/i.test(program) ? program : null;
  const [user, entries] = await Promise.all([getCurrentUser(), listHallOfFame(programId)]);
  const programName = programId ? entries[0]?.programName : null;

  const byProgram = new Map<string, typeof entries>();
  for (const e of entries) byProgram.set(e.programId, [...(byProgram.get(e.programId) ?? []), e]);

  return (
    <SimplePageShell title={programName ? `${programName} Hall of Fame` : "Hall of Fame"} user={user}>
      <div className="space-y-8">
        <p className="text-sm text-ink-muted">
          Researchers thanked by the organizations they reported to, with their consent. Programs without bounties, such as vulnerability disclosure programs, recognise researchers here.
          {programId && (
            <>
              {" "}
              <Link prefetch={false} href={"/hall-of-fame" as Route} className="font-medium text-action underline underline-offset-2">
                All programs
              </Link>
            </>
          )}
        </p>
        {entries.length === 0 ? (
          <EmptyState title="No one here yet">When an organization thanks a researcher and they agree to be named, they appear here.</EmptyState>
        ) : (
          [...byProgram.values()].map((list) => (
            <section key={list[0].programId} className="space-y-2">
              <h2 className="text-base font-semibold text-ink">
                <Link prefetch={false} href={`/organizations/${list[0].organizationId}/programs/${list[0].programId}` as Route} className="hover:text-action">
                  {list[0].programName}
                </Link>{" "}
                <span className="text-sm font-normal text-ink-muted">· {list[0].organizationName}</span>
              </h2>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {list.map((e, i) => (
                  <li key={`${e.researcherUsername}-${i}`} className="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
                    <span className="min-w-0">
                      {e.researcherUsername ? (
                        <Link prefetch={false} href={`/researchers/${e.researcherUsername}` as Route} className="font-medium text-ink hover:text-action">
                          {e.researcherDisplayName}
                        </Link>
                      ) : (
                        <span className="font-medium text-ink">{e.researcherDisplayName}</span>
                      )}
                      {e.note && <span className="text-ink-muted"> · {e.note}</span>}
                    </span>
                    <span className="text-xs text-ink-muted">
                      <LocalTime value={e.publishedAt} dateOnly />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </SimplePageShell>
  );
}
