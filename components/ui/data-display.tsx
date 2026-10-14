import React from "react";
import { cn } from "../../lib/cn";
import { EmptyState, ErrorState, LoadingState } from "./feedback";

export function Table({ className, children }: React.TableHTMLAttributes<HTMLTableElement>) { return <div className="overflow-x-auto"><table className={cn("w-full min-w-[38rem] border-collapse text-left text-sm", className)}>{children}</table></div>; }

/** `pinEnd`: keep this column (row actions) pinned to the right while a wide table scrolls on a phone. */
export type DataColumn<T> = { id: string; header: string; cell: (row: T) => React.ReactNode; pinEnd?: boolean };
const PIN_END = " sticky right-0 shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]";
// hover:bg-surface-muted previously snapped instantly -- a hard color cut on a row a user
// scans down repeatedly. Named property (background-color), `ease` per the hover/color
// table (not ease-out, which is for entering/exiting elements), 150ms: fast enough to
// stay invisible at the tens-of-times-per-session frequency a data table row gets hovered.
export function DataTable<T extends { id: string }>({ columns, rows, state = "ready", error }: { columns: DataColumn<T>[]; rows: T[]; state?: "ready" | "loading" | "error"; error?: string }) { if (state === "loading") return <LoadingState label="Loading records" />; if (state === "error") return <ErrorState title="Records could not be loaded">{error ?? "Try again when the connection is available."}</ErrorState>; if (!rows.length) return <EmptyState title="No records">There are no records to display yet.</EmptyState>; return <Table><thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr>{columns.map((column) => <th key={column.id} scope="col" className={`px-4 py-3 font-semibold${column.pinEnd ? `${PIN_END} bg-surface-muted` : ""}`}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} tabIndex={0} className="border-b border-border last:border-0 transition-colors duration-150 ease motion-reduce:transition-none hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">{columns.map((column) => <td key={column.id} className={`px-4 py-3${column.pinEnd ? `${PIN_END} bg-surface` : ""}`}>{column.cell(row)}</td>)}</tr>)}</tbody></Table>; }

export function ActivityTimeline({ items }: { items: { id: string; title: string; detail: string; timestamp: React.ReactNode }[] }) { if (!items.length) return <EmptyState title="No activity">Events will appear here when recorded.</EmptyState>; return <ol className="border-l border-border pl-5">{items.map((item) => <li key={item.id} className="relative pb-6 last:pb-0"><span aria-hidden="true" className="absolute -left-[1.65rem] top-1 size-3 rounded-full border-2 border-surface bg-action" /><p className="text-sm font-semibold">{item.title}</p><p className="mt-1 text-sm text-ink-muted">{item.detail}</p><p className="mt-1 text-xs text-ink-muted">{item.timestamp}</p></li>)}</ol>; }
