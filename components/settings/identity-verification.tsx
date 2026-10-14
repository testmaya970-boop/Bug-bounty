"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Input, Select } from "../ui/form";
import { Button } from "../ui/button";
import { checkPhoneCodeAction, completeSandboxIdentityAction, startIdentityVerificationAction, startPhoneVerificationAction } from "../../actions/integrations";

const REGION_LABEL = { IN: "Verify with DigiLocker (India: Aadhaar / PAN)", GLOBAL: "Verify with a passport or ID card (other countries)" } as const;

/** One button per region whose provider is configured; sends the browser to the provider's hosted flow. */
export function IdentityStartButtons({ regions }: { regions: { region: "IN" | "GLOBAL"; mode: "sandbox" | "live" }[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {regions.map(({ region, mode }) => (
          <Button
            key={region}
            type="button"
            pending={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await startIdentityVerificationAction({ region });
                if (!result.ok) return setError(result.message);
                window.location.assign(result.data.url);
              })
            }
          >
            {REGION_LABEL[region]}
            {mode === "sandbox" && <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-warning">Sandbox</span>}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const COUNTRY_CODES = [
  { code: "+91", label: "India (+91)" },
  { code: "+1", label: "United States / Canada (+1)" },
  { code: "+44", label: "United Kingdom (+44)" },
  { code: "+61", label: "Australia (+61)" },
  { code: "+49", label: "Germany (+49)" },
  { code: "+65", label: "Singapore (+65)" },
  { code: "+971", label: "UAE (+971)" },
];

/** Send a code, then confirm it. In sandbox mode no SMS is sent, so the code is shown. */
export function PhoneVerificationForm({ hasPending, routes }: { hasPending: boolean; routes: { india: boolean; global: boolean } }) {
  const router = useRouter();
  // Only the countries a configured provider can text.
  const countries = COUNTRY_CODES.filter((c) => (c.code === "+91" ? routes.india : routes.global));
  const [countryCode, setCountryCode] = useState(countries[0]?.code ?? "+91");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(hasPending);
  const [sandboxCode, setSandboxCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            const result = await startPhoneVerificationAction({ countryCode, number });
            if (!result.ok) return setError(result.message);
            setSent(true);
            setSandboxCode(result.data.sandboxCode ?? null);
          });
        }}
      >
        <Select label="Country" value={countryCode} onChange={(event) => setCountryCode(event.target.value)} className="w-56">
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </Select>
        <Input label="Mobile number" inputMode="tel" autoComplete="tel-national" value={number} onChange={(event) => setNumber(event.target.value)} className="w-48" required />
        <Button type="submit" pending={pending} variant="secondary">
          {sent ? "Send a new code" : "Send code"}
        </Button>
      </form>

      {sandboxCode && (
        <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Sandbox mode: no SMS was sent. Your code is <span className="font-mono font-semibold">{sandboxCode}</span>.
        </p>
      )}

      {sent && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              setError(null);
              const result = await checkPhoneCodeAction({ code });
              if (!result.ok) return setError(result.message);
              router.refresh();
            });
          }}
        >
          <Input label="Code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="w-40" required />
          <Button type="submit" pending={pending}>
            Verify
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** The sandbox stand-in for a provider's verdict. */
export function SandboxIdentityDecision({ reference }: { reference: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const decide = (outcome: "approved" | "declined") =>
    startTransition(async () => {
      setError(null);
      const result = await completeSandboxIdentityAction({ reference, outcome });
      if (!result.ok) return setError(result.message);
      router.push("/settings/identity" as Route);
    });
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button type="button" pending={pending} onClick={() => decide("approved")}>
          Approve verification
        </Button>
        <Button type="button" variant="secondary" pending={pending} onClick={() => decide("declined")}>
          Decline verification
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
