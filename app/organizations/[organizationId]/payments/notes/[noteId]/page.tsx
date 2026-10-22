import React from "react";
import { notFound } from "next/navigation";
import { AppShell } from "../../../../../../components/app-shell";
import { billingGate } from "../../../../../../components/documents/billing-gate";
import { DocumentSheet, DocumentTable, DocumentToolbar, DocumentTotals, money } from "../../../../../../components/documents/document-sheet";
import { getInvoice } from "../../../../../../services/billing";
import { getInvoiceNote } from "../../../../../../services/documents";
import { countryName } from "../../../../../../lib/countries";

/** A GST credit or debit note against an issued invoice (202610220040). Immutable once issued. */
export default async function InvoiceNotePage({ params }: { params: Promise<{ organizationId: string; noteId: string }> }) {
  const { organizationId, noteId } = await params;
  const base = `/organizations/${organizationId}/payments`;
  const gate = await billingGate(organizationId, `${base}/notes/${noteId}`, "Credit or debit note");
  if (gate.denied) return gate.denied;
  const note = await getInvoiceNote(noteId);
  if (!note || note.organizationId !== organizationId) notFound();
  const invoice = await getInvoice(note.invoiceId);
  if (!invoice) notFound();
  const credit = note.kind === "credit";
  const taxRows = (
    [
      ["CGST 9%", note.cgstMinorUnits],
      ["SGST 9%", note.sgstMinorUnits],
      ["IGST 18%", note.igstMinorUnits],
    ] as [string, number][]
  ).filter(([, v]) => v > 0);
  const buyer = invoice.buyer;

  return (
    <AppShell title={credit ? "Credit note" : "Debit note"} user={gate.user} organizationId={organizationId}>
      <div className="max-w-4xl space-y-4">
        <DocumentToolbar back={{ href: `${base}/documents`, label: "Billing documents" }} />
        <DocumentSheet
          title={credit ? "Credit note" : "Debit note"}
          number={note.number}
          sandbox={invoice.seller.name.includes("SANDBOX")}
          meta={[
            ["Issued", note.issuedAt.slice(0, 10)],
            ["Original invoice", invoice.number],
            ["Invoice date", invoice.issuedAt.slice(0, 10)],
          ]}
          parties={[
            { title: "From", name: invoice.seller.name, lines: [invoice.seller.address, invoice.seller.gstin ? `GSTIN ${invoice.seller.gstin}` : null] },
            { title: "To", name: buyer.name, lines: [[buyer.address_line, buyer.city, buyer.postal_code, countryName(buyer.country)].filter(Boolean).join(", "), buyer.gstin ? `GSTIN ${buyer.gstin}` : null] },
          ]}
          footnotes={[
            credit ? "This note reduces the taxable value and GST of the original invoice. The credit returns to your prepaid balance." : "This note adds to the taxable value and GST of the original invoice.",
            invoice.taxNote,
          ]}
        >
          <DocumentTable columns={[{ header: "Reason" }, { header: "Taxable value", align: "right" }]} rows={[[note.reason, money(note.subtotalMinorUnits, note.currency)]]} empty="" />
          <DocumentTotals rows={[["Taxable value", money(note.subtotalMinorUnits, note.currency)], ...taxRows.map(([l, v]): [string, string] => [l, money(v, note.currency)]), [credit ? "Total credit" : "Total due", money(note.totalMinorUnits, note.currency)]]} />
        </DocumentSheet>
      </div>
    </AppShell>
  );
}
