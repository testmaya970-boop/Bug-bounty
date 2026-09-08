import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProfessionalDetailsSettings } from "../../components/settings/professional-details-settings";
import { PersonalDetailsSettings } from "../../components/settings/personal-details-settings";
import { KycSettings } from "../../components/settings/kyc-settings";
import { PayoutDetailsSettings } from "../../components/settings/payout-details-settings";
import { RecommendedProgramsList } from "../../components/programs/recommended-programs-list";
import { ProgramFocusAreasPanel } from "../../components/programs/program-focus-areas-panel";
import { genderLabel, focusAreaLabel } from "../../lib/researcher-identity-labels";
import type { KycStatusSummary, PayoutDetailsSummary, ProfessionalDetails, RecommendedProgram } from "../../types/researcher-identity";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const EMPTY_PROFESSIONAL: ProfessionalDetails = {
  qualification: null,
  experienceLevel: null,
  employmentStatus: null,
  linkedinUrl: null,
  resumeUrl: null,
  hackingInterests: [],
  hackingTools: [],
  securityFocus: [],
};

const EMPTY_KYC: KycStatusSummary = {
  phoneCountryCode: null,
  phoneSubmitted: false,
  phoneStatus: "not_submitted",
  aadhaarSubmitted: false,
  aadhaarStatus: "not_submitted",
  panSubmitted: false,
  panStatus: "not_submitted",
  passportSubmitted: false,
  passportDateOfBirth: null,
  passportStatus: "not_submitted",
  submittedAt: null,
  reviewedAt: null,
  reviewNote: null,
  updatedAt: null,
};

const EMPTY_PAYOUT: PayoutDetailsSummary = {
  method: null,
  bankAccountHolderName: null,
  bankAccountLast4: null,
  bankIfscOrRouting: null,
  paypalEmail: null,
  payoutThresholdMinorUnits: null,
  payoutSchedule: "immediate",
  taxFormType: null,
  taxIdLast4: null,
  taxFormStatus: "not_submitted",
  taxFormSubmittedAt: null,
  taxFormReviewNote: null,
  updatedAt: null,
};

describe("ProfessionalDetailsSettings: real interests power a real recommendation match (see docs/decisions/0051)", () => {
  it("renders real values when set", () => {
    const html = renderToStaticMarkup(<ProfessionalDetailsSettings initial={{ ...EMPTY_PROFESSIONAL, qualification: "Undergraduate", hackingInterests: ["apis"] }} />);
    expect(html).toContain("Undergraduate");
  });

  it("shows every focus-area/tool/security-focus checkbox with a real label, never a raw enum value", () => {
    const html = renderToStaticMarkup(<ProfessionalDetailsSettings initial={EMPTY_PROFESSIONAL} />);
    expect(html).toContain(focusAreaLabel("web_applications"));
    expect(html).not.toContain("web_applications");
  });

  it("frames interests as recommendation input, never a fabricated scored profile", () => {
    const html = renderToStaticMarkup(<ProfessionalDetailsSettings initial={EMPTY_PROFESSIONAL} />);
    expect(html.toLowerCase()).toContain("recommend");
    expect(html.toLowerCase()).not.toContain("follower");
    expect(html.toLowerCase()).not.toContain("badge earned");
  });
});

describe("PersonalDetailsSettings: gender/age, explicitly private (see docs/decisions/0051)", () => {
  it("renders real values and discloses this is never shown to an organization", () => {
    const html = renderToStaticMarkup(<PersonalDetailsSettings initial={{ gender: "female", ageGroup: "18_30" }} />);
    expect(html).toContain(genderLabel("female"));
    expect(html.toLowerCase()).toContain("never shown to any organization");
  });
});

describe("KycSettings: real fields, manually reviewed -- never a fake verification call", () => {
  it("never renders a fake 'Verify via DigiLocker' or 'Verify PAN' call to action", () => {
    const html = renderToStaticMarkup(<KycSettings initial={EMPTY_KYC} />);
    expect(html).not.toContain("Verify via DigiLocker");
    expect(html).not.toContain("Verify PAN");
    expect(html).not.toContain("Verify Aadhaar");
  });

  it("shows a real status badge per field", () => {
    const html = renderToStaticMarkup(<KycSettings initial={{ ...EMPTY_KYC, aadhaarStatus: "verified", panStatus: "pending" }} />);
    expect(html).toContain("Verified");
    expect(html).toContain("Pending review");
  });

  it("discloses that review is manual, not automated", () => {
    const html = renderToStaticMarkup(<KycSettings initial={EMPTY_KYC} />);
    expect(html.toLowerCase()).toContain("reviewed manually");
  });
});

describe("PayoutDetailsSettings: encrypted bank/PayPal details, only ever showing the last 4 digits back", () => {
  it("shows the masked last4 as a helper, never the full account number", () => {
    const html = renderToStaticMarkup(<PayoutDetailsSettings initial={{ ...EMPTY_PAYOUT, method: "bank_transfer", bankAccountLast4: "1234" }} />);
    expect(html).toContain("1234");
    expect(html).not.toMatch(/\d{6,}/);
  });

  it("switches fields by method", () => {
    const bank = renderToStaticMarkup(<PayoutDetailsSettings initial={{ ...EMPTY_PAYOUT, method: "bank_transfer" }} />);
    expect(bank).toContain("Account holder name");
    const paypal = renderToStaticMarkup(<PayoutDetailsSettings initial={{ ...EMPTY_PAYOUT, method: "paypal" }} />);
    expect(paypal).toContain("PayPal email");
    expect(paypal).not.toContain("Account holder name");
  });
});

describe("RecommendedProgramsList / ProgramFocusAreasPanel: a literal overlap match, never a fabricated model", () => {
  const program: RecommendedProgram = {
    id: "p1",
    organizationId: "o1",
    name: "Acme Web Bounty",
    organizationName: "Acme",
    status: "active",
    description: null,
    focusAreas: ["web_applications", "apis"],
    updatedAt: "2026-01-01T00:00:00Z",
  };

  it("shows which declared interest matched, never an 'AI' or algorithmic claim", () => {
    const html = renderToStaticMarkup(<RecommendedProgramsList programs={[program]} />);
    expect(html).toContain("Acme Web Bounty");
    expect(html.toLowerCase()).toContain("matches your interest");
    expect(html.toLowerCase()).not.toContain("ai");
    expect(html.toLowerCase()).not.toContain("algorithm");
  });

  it("ProgramFocusAreasPanel renders every focus area option with a real label", () => {
    const html = renderToStaticMarkup(<ProgramFocusAreasPanel organizationId="o1" programId="p1" focusAreas={["networks"]} />);
    expect(html).toContain(focusAreaLabel("networks"));
    expect(html.toLowerCase()).toContain("real, literal match");
  });
});
