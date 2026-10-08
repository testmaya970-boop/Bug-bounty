"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "../ui/form";
import { Button } from "../ui/button";
import { Alert } from "../ui/feedback";
import { SectionLabel } from "../ui/security-primitives";
import { KycStatusBadge } from "../ui/badge";
import { submitMyKycAction } from "../../actions/researcher-profiles";
import type { KycStatusSummary } from "../../types/researcher-identity";

/**
 * Real KYC fields, reviewed manually by a platform admin -- deliberately NOT a "Verify via
 * DigiLocker"/"Verify PAN" button. Unpatched has no real government-ID-verification
 * provider integration; a button claiming to verify identity with nothing real behind it
 * is fabricated security theater. See docs/decisions/0051 and app/platform/kyc (the real
 * review surface) for the other half of this.
 *
 * Each field is its own small form: submitting one never touches the others (the
 * underlying RPC only updates the field it's given), matching how the fields are reviewed
 * independently too.
 */
export function KycSettings({ initial }: { initial: KycStatusSummary }) {
  return (
    <div className="space-y-6 border-t border-border pt-6">
      <div>
        <SectionLabel>KYC verification</SectionLabel>
        <p className="mt-1 text-sm text-ink-muted">Submitted details are encrypted and reviewed manually. A platform admin marks each field verified or rejected. There is no automated verification.</p>
      </div>

      <PhoneField initial={initial} />
      <AadhaarField initial={initial} />
      <PanField initial={initial} />
      <PassportField initial={initial} />
    </div>
  );
}

function FieldShell({ title, status, note, children }: { title: string; status: KycStatusSummary["phoneStatus"]; note: string | null; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <KycStatusBadge status={status} />
      </div>
      {note && status === "rejected" && <p className="mt-1 text-xs text-danger">{note}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PhoneField({ initial }: { initial: KycStatusSummary }) {
  const router = useRouter();
  const [countryCode, setCountryCode] = useState(initial.phoneCountryCode ?? "+1");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitMyKycAction({ phoneCountryCode: countryCode, phoneNumber });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPhoneNumber("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <FieldShell title="Phone number" status={initial.phoneStatus} note={initial.reviewNote}>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <Input label="Country code" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="sm:w-28" maxLength={8} />
        <Input label="Phone number" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} className="sm:flex-1" maxLength={20} placeholder={initial.phoneSubmitted ? "On file, enter a new number to replace it" : "Enter your phone number"} />
        <Button type="submit" pending={pending} disabled={!phoneNumber}>
          Submit
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Phone number submitted for review." className="mt-2" />}
    </FieldShell>
  );
}

function AadhaarField({ initial }: { initial: KycStatusSummary }) {
  const router = useRouter();
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitMyKycAction({ aadhaarNumber });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAadhaarNumber("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <FieldShell title="Aadhaar verification" status={initial.aadhaarStatus} note={initial.reviewNote}>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <Input label="Aadhaar number" value={aadhaarNumber} onChange={(event) => setAadhaarNumber(event.target.value)} className="sm:flex-1" maxLength={12} placeholder={initial.aadhaarSubmitted ? "On file, enter a new number to replace it" : "12-digit Aadhaar number"} />
        <Button type="submit" pending={pending} disabled={!aadhaarNumber}>
          Submit
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Aadhaar submitted for review." className="mt-2" />}
    </FieldShell>
  );
}

function PanField({ initial }: { initial: KycStatusSummary }) {
  const router = useRouter();
  const [panNumber, setPanNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitMyKycAction({ panNumber });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPanNumber("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <FieldShell title="PAN verification" status={initial.panStatus} note={initial.reviewNote}>
      <p className="mb-2 text-xs text-ink-muted">Mandatory for bounty payouts and invoice generation.</p>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <Input label="PAN number" value={panNumber} onChange={(event) => setPanNumber(event.target.value.toUpperCase())} className="sm:flex-1" maxLength={10} placeholder={initial.panSubmitted ? "On file, enter a new number to replace it" : "e.g. ABCDE1234F"} />
        <Button type="submit" pending={pending} disabled={!panNumber}>
          Submit
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="PAN submitted for review." className="mt-2" />}
    </FieldShell>
  );
}

function PassportField({ initial }: { initial: KycStatusSummary }) {
  const router = useRouter();
  const [passportNumber, setPassportNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState(initial.passportDateOfBirth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await submitMyKycAction({ passportNumber, passportDateOfBirth: dateOfBirth || undefined });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPassportNumber("");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <FieldShell title="Passport verification" status={initial.passportStatus} note={initial.reviewNote}>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleSubmit}>
        <Input label="Passport number" value={passportNumber} onChange={(event) => setPassportNumber(event.target.value.toUpperCase())} className="sm:flex-1" maxLength={20} placeholder={initial.passportSubmitted ? "On file, enter a new number to replace it" : "Passport file number"} />
        <Input label="Date of birth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="sm:w-44" />
        <Button type="submit" pending={pending} disabled={!passportNumber}>
          Submit
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {saved && <Alert tone="success" title="Passport submitted for review." className="mt-2" />}
    </FieldShell>
  );
}
