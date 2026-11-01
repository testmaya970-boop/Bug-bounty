"use client";

import React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useSearchParams } from "next/navigation";

export function Pagination({
  page,
  pageSize,
  total,
  label = "items",
  paramName = "page",
}: {
  page: number;
  pageSize: number;
  total: number;
  label?: string;
  paramName?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (total <= pageSize && page <= 1) {
    return null;
  }

  function hrefForPage(targetPage: number): Route {
    const next = new URLSearchParams(searchParams.toString());
    if (targetPage <= 1) {
      next.delete(paramName);
    } else {
      next.set(paramName, String(targetPage));
    }
    const qs = next.toString();
    return (qs ? `${pathname}?${qs}` : pathname) as Route;
  }

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <nav aria-label={`Pagination for ${label}`} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[#E7EAF0] bg-white px-5 py-3 text-sm text-[#475467] shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <span>
        Showing <span className="font-mono font-semibold text-[#111827] tabular-nums">{start}</span>–
        <span className="font-mono font-semibold text-[#111827] tabular-nums">{end}</span> of{" "}
        <span className="font-mono font-semibold text-[#111827] tabular-nums">{total}</span> {label}
      </span>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link
            href={hrefForPage(page - 1)}
            prefetch={false}
            className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC]"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#98A2B3]">
            Previous
          </span>
        )}
        <span className="font-mono text-xs text-[#667085] tabular-nums">
          Page {page} of {totalPages}
        </span>
        {page < totalPages ? (
          <Link
            href={hrefForPage(page + 1)}
            prefetch={false}
            className="rounded-lg border border-[#E7EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#344054] hover:bg-[#F8FAFC]"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg border border-[#E7EAF0] bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#98A2B3]">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
