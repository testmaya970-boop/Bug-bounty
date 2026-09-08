import React from "react";
import Link from "next/link";
import { Card } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import type { MOCK_RESEARCHER_STATUS } from "../../lib/mock/researcher-dashboard";

type Status = typeof MOCK_RESEARCHER_STATUS;

const STAT_ITEMS: { key: keyof Status; label: string }[] = [
  { key: "programsFollowed", label: "Programs followed" },
  { key: "submissions", label: "Submissions" },
  { key: "acceptedReports", label: "Accepted reports" },
  { key: "reputationPoints", label: "Reputation" },
];

export function StatsOverview({ status }: { status: Status }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
      {STAT_ITEMS.map((item) => (
        <Card key={item.key} className="p-4">
          <SectionLabel>{item.label}</SectionLabel>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums text-ink">{status[item.key].toLocaleString("en-US")}</p>
        </Card>
      ))}
      <Card className="col-span-2 flex flex-col justify-between bg-ink p-4 text-canvas sm:col-span-4 lg:col-span-1">
        <div>
          <SectionLabel className="text-canvas/60">Lifetime rewards</SectionLabel>
          <p className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">{status.lifetimeRewardsLabel}</p>
        </div>
        <Link href="/researchers" className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-canvas underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canvas">
          View reputation record →
        </Link>
      </Card>
    </div>
  );
}
