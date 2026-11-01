import "server-only";
import { withActorTransaction, withPublicTransaction, callRpc } from "@/lib/db/pool";
import type { ExternalHandles } from "@/lib/external-profiles";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OrganizationServiceError, mapRpcError as mapError } from "@/services/rpc-error";
import type {
  KycField,
  KycStatus,
  KycStatusSummary,
  KycSubmissionSummary,
  PayoutDetailsSummary,
  PayoutMethod,
  PayoutSchedule,
  PersonalDetails,
  ProfessionalDetails,
  RecommendedProgram,
  ResearcherAgeGroup,
  ResearcherEmploymentStatus,
  ResearcherExperienceLevel,
  ResearcherFocusArea,
  ResearcherGender,
  ResearcherSecurityFocus,
  ResearcherToolCategory,
  TaxFormType,
} from "@/types/researcher-identity";

export { OrganizationServiceError };

/**
 * The real, minimal researcher self-service profile -- display name (public.users) plus
 * a biography (public.researcher_profiles). See
 * docs/decisions/0049-researcher-identity-audit.md for why avatar upload is deliberately
 * not built here, and why no skills/certifications/location/social-metric field exists.
 */

export async function getMyBiography(userId: string): Promise<string | null> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client.query<{ biography: string | null }>("select biography from public.researcher_profiles where user_id = $1", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.biography ?? null;
}

/** Any researcher's own biography, for display to another viewer (e.g. an organization
 * triaging their report); nothing for a deactivated account. Returns null both
 * when the researcher has never set a bio and when no profile row exists at all --
 * identical, honest degradation, never an error. */
export async function getResearcherBiography(userId: string): Promise<string | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    // researcher_profiles is own-row only (202610160001): the biography alone comes through
    // get_researcher_biography, never the resume, LinkedIn or handles.
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      client.query<{ biography: string | null }>("select public.get_researcher_biography($1) as biography", [userId]).then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0]?.biography ?? null;
}

export async function upsertMyBiography(biography: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.upsert_my_researcher_profile", [biography]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export async function updateMyDisplayName(displayName: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.update_my_display_name", [displayName]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// Professional details + interests (public.researcher_profiles, same public-read tier as
// biography) -- see docs/decisions/0051 for why interests exist now (a real recommendation
// match, not vanity profile filler) while gender/age/KYC/payout stay self-only below.
// ---------------------------------------------------------------------------

export async function getMyProfessionalDetails(userId: string): Promise<ProfessionalDetails | null> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<{
          qualification: string | null;
          experience_level: ResearcherExperienceLevel | null;
          employment_status: ResearcherEmploymentStatus | null;
          linkedin_url: string | null;
          resume_url: string | null;
          hacking_interests: ResearcherFocusArea[];
          hacking_tools: ResearcherToolCategory[];
          security_focus: ResearcherSecurityFocus[];
        }>(
          "select qualification, experience_level, employment_status, linkedin_url, resume_url, hacking_interests, hacking_tools, security_focus from public.researcher_profiles where user_id = $1",
          [userId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const data = rows[0];
  if (!data) return null;
  return {
    qualification: data.qualification,
    experienceLevel: data.experience_level,
    employmentStatus: data.employment_status,
    linkedinUrl: data.linkedin_url,
    resumeUrl: data.resume_url,
    hackingInterests: data.hacking_interests,
    hackingTools: data.hacking_tools,
    securityFocus: data.security_focus,
  };
}

export async function updateMyProfessionalDetails(input: {
  qualification?: string;
  experienceLevel?: ResearcherExperienceLevel;
  employmentStatus?: ResearcherEmploymentStatus;
  linkedinUrl?: string;
  resumeUrl?: string;
  hackingInterests?: ResearcherFocusArea[];
  hackingTools?: ResearcherToolCategory[];
  securityFocus?: ResearcherSecurityFocus[];
}): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc(client, "public.update_my_professional_details", [
        input.qualification ?? null,
        input.experienceLevel ?? null,
        input.employmentStatus ?? null,
        input.linkedinUrl ?? null,
        input.resumeUrl ?? null,
        input.hackingInterests ?? [],
        input.hackingTools ?? [],
        input.securityFocus ?? [],
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// Personal details (gender/age group) -- public.researcher_personal_details, self-only.
// Never readable by an organization, unlike biography/professional details above.
// ---------------------------------------------------------------------------

export async function getMyPersonalDetails(): Promise<PersonalDetails> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ gender: ResearcherGender | null; age_group: ResearcherAgeGroup | null }>(client, "public.get_my_personal_details"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  return { gender: row?.gender ?? null, ageGroup: row?.age_group ?? null };
}

export async function updateMyPersonalDetails(input: { gender?: ResearcherGender; ageGroup?: ResearcherAgeGroup }): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.upsert_my_personal_details", [input.gender ?? null, input.ageGroup ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// KYC -- public.researcher_kyc, self + platform-admin only. upsertMyKyc is write-only from
// the client's perspective: the raw Aadhaar/PAN/passport/phone value is never read back,
// only statuses (see get_my_kyc_status's own comment on why). No fake "Verify via
// DigiLocker" call exists here -- Unpatched has no real government-ID-verification
// provider; a platform admin marks a field verified/rejected after manual review.
// ---------------------------------------------------------------------------

type KycStatusRow = {
  phone_country_code: string | null;
  phone_submitted: boolean;
  phone_status: KycStatusSummary["phoneStatus"];
  aadhaar_submitted: boolean;
  aadhaar_status: KycStatusSummary["aadhaarStatus"];
  pan_submitted: boolean;
  pan_status: KycStatusSummary["panStatus"];
  passport_submitted: boolean;
  passport_date_of_birth: string | null;
  passport_status: KycStatusSummary["passportStatus"];
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  updated_at: string | null;
};

const EMPTY_KYC_STATUS: KycStatusSummary = {
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

export async function getMyKycStatus(): Promise<KycStatusSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<KycStatusRow>(client, "public.get_my_kyc_status"));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return EMPTY_KYC_STATUS;
  return {
    phoneCountryCode: row.phone_country_code,
    phoneSubmitted: row.phone_submitted,
    phoneStatus: row.phone_status,
    aadhaarSubmitted: row.aadhaar_submitted,
    aadhaarStatus: row.aadhaar_status,
    panSubmitted: row.pan_submitted,
    panStatus: row.pan_status,
    passportSubmitted: row.passport_submitted,
    passportDateOfBirth: row.passport_date_of_birth,
    passportStatus: row.passport_status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    updatedAt: row.updated_at,
  };
}

export async function submitMyKyc(input: { phoneCountryCode?: string; phoneNumber?: string; aadhaarNumber?: string; panNumber?: string; passportNumber?: string; passportDateOfBirth?: string }): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc(client, "public.upsert_my_kyc", [
        input.phoneCountryCode ?? null,
        input.phoneNumber ?? null,
        input.aadhaarNumber ?? null,
        input.panNumber ?? null,
        input.passportNumber ?? null,
        input.passportDateOfBirth ?? null,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** Platform-admin-only queue -- see app/platform/kyc. */
export async function listKycSubmissions(): Promise<KycSubmissionSummary[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{
        user_id: string;
        display_name: string;
        email: string | null;
        phone_status: KycStatusSummary["phoneStatus"];
        aadhaar_status: KycStatusSummary["aadhaarStatus"];
        pan_status: KycStatusSummary["panStatus"];
        passport_status: KycStatusSummary["passportStatus"];
        submitted_at: string | null;
        reviewed_at: string | null;
      }>(client, "public.list_kyc_submissions"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    phoneStatus: row.phone_status,
    aadhaarStatus: row.aadhaar_status,
    panStatus: row.pan_status,
    passportStatus: row.passport_status,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
  }));
}

export async function reviewKycField(targetUserId: string, field: KycField, decision: "verified" | "rejected", note?: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.review_kyc_field", [targetUserId, field, decision, note ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

export type PendingTaxForm = { userId: string; displayName: string; email: string | null; taxFormType: TaxFormType; taxIdLast4: string | null; submittedAt: string | null };

/** Platform-admin-only queue (202610060008): a verified tax form is one of the payout gates. */
export async function listPendingTaxForms(): Promise<PendingTaxForm[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{ user_id: string; display_name: string; email: string | null; tax_form_type: TaxFormType; tax_id_last4: string | null; submitted_at: string | null }>(client, "public.list_pending_tax_forms"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({ userId: row.user_id, displayName: row.display_name, email: row.email, taxFormType: row.tax_form_type, taxIdLast4: row.tax_id_last4, submittedAt: row.submitted_at }));
}

export async function reviewTaxForm(targetUserId: string, decision: "verified" | "rejected", note?: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.review_tax_form", [targetUserId, decision, note ?? null]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// Payout details -- public.researcher_payout_details, self + platform-admin only. The payout
// gate (private.payout_blockers, 202610060008) requires a method and a verified tax form
// before any payout attempt; the destination itself is never shown to the paying org.
// ---------------------------------------------------------------------------

type PayoutDetailsRow = {
  method: PayoutMethod | null;
  bank_account_holder_name: string | null;
  bank_account_last4: string | null;
  bank_ifsc_or_routing: string | null;
  paypal_email: string | null;
  payout_threshold_minor_units: number | null;
  payout_schedule: PayoutSchedule;
  tax_form_type: TaxFormType | null;
  tax_id_last4: string | null;
  tax_form_status: KycStatus;
  tax_form_submitted_at: string | null;
  tax_form_review_note: string | null;
  updated_at: string | null;
};

const EMPTY_PAYOUT_DETAILS: PayoutDetailsSummary = {
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

export async function getMyPayoutDetails(): Promise<PayoutDetailsSummary> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) => callRpc<PayoutDetailsRow>(client, "public.get_my_payout_details"));
  } catch (error) {
    mapError(error as { message: string });
  }
  const row = rows[0];
  if (!row) return EMPTY_PAYOUT_DETAILS;
  return {
    method: row.method,
    bankAccountHolderName: row.bank_account_holder_name,
    bankAccountLast4: row.bank_account_last4,
    bankIfscOrRouting: row.bank_ifsc_or_routing,
    paypalEmail: row.paypal_email,
    payoutThresholdMinorUnits: row.payout_threshold_minor_units,
    payoutSchedule: row.payout_schedule,
    taxFormType: row.tax_form_type,
    taxIdLast4: row.tax_id_last4,
    taxFormStatus: row.tax_form_status,
    taxFormSubmittedAt: row.tax_form_submitted_at,
    taxFormReviewNote: row.tax_form_review_note,
    updatedAt: row.updated_at,
  };
}

export async function updateMyPayoutDetails(input: {
  method: PayoutMethod;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankIfscOrRouting?: string;
  paypalEmail?: string;
  payoutThresholdMinorUnits?: number;
  payoutSchedule?: PayoutSchedule;
}): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc(client, "public.upsert_my_payout_details", [
        input.method,
        input.bankAccountHolderName ?? null,
        input.bankAccountNumber ?? null,
        input.bankIfscOrRouting ?? null,
        input.paypalEmail ?? null,
        input.payoutThresholdMinorUnits ?? null,
        input.payoutSchedule ?? null,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** A tax identifier is its own small form, deliberately separate from the general payout
 * upsert -- same "each sensitive field is its own submission" convention KYC already
 * established (components/settings/kyc-settings.tsx). Encrypted at rest, only the last 4
 * characters ever read back (see upsert_my_tax_form). */
export async function submitMyTaxForm(taxFormType: TaxFormType, taxId: string): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) => callRpc(client, "public.upsert_my_tax_form", [taxFormType, taxId]));
  } catch (error) {
    mapError(error as { message: string });
  }
}

// ---------------------------------------------------------------------------
// External platform handles -- self-reported, explicitly unverified (see
// docs/decisions/0055 and this migration's own header comment). Never read by
// reputation, matching, or any trust-relevant code path -- display-only, always labeled
// unverified in the UI.
// ---------------------------------------------------------------------------

export type { ExternalHandles } from "@/lib/external-profiles";
export type ExternalProfileSettings = ExternalHandles & { showExternalLinks: boolean };

type ExternalHandles_DB = {
  hackerone_handle: string | null;
  bugcrowd_handle: string | null;
  cobalt_handle: string | null;
  github_handle: string | null;
  gitlab_handle: string | null;
  x_handle: string | null;
  hackthebox_handle: string | null;
};

function toExternalHandles(row: ExternalHandles_DB | undefined): ExternalHandles {
  return {
    hackeroneHandle: row?.hackerone_handle ?? null,
    bugcrowdHandle: row?.bugcrowd_handle ?? null,
    cobaltHandle: row?.cobalt_handle ?? null,
    githubHandle: row?.github_handle ?? null,
    gitlabHandle: row?.gitlab_handle ?? null,
    xHandle: row?.x_handle ?? null,
    hacktheboxHandle: row?.hackthebox_handle ?? null,
  };
}

export async function getMyExternalHandles(userId: string): Promise<ExternalProfileSettings> {
  let rows;
  try {
    rows = await withActorTransaction(userId, (client) =>
      client
        .query<ExternalHandles_DB & { show_external_links: boolean }>(
          "select hackerone_handle, bugcrowd_handle, cobalt_handle, github_handle, gitlab_handle, x_handle, hackthebox_handle, show_external_links from public.researcher_profiles where user_id = $1",
          [userId],
        )
        .then((r) => r.rows),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return { ...toExternalHandles(rows[0]), showExternalLinks: rows[0]?.show_external_links ?? false };
}

/** Handles must already be normalized (lib/external-profiles.ts); the RPC re-checks formats. */
export async function updateMyExternalHandles(input: ExternalProfileSettings): Promise<void> {
  const actor = await getCurrentUser();
  try {
    await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc(client, "public.update_my_external_handles", [
        input.hackeroneHandle,
        input.bugcrowdHandle,
        input.cobaltHandle,
        input.githubHandle,
        input.gitlabHandle,
        input.xHandle,
        input.hacktheboxHandle,
        input.showExternalLinks,
      ]),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
}

/** A public profile's external links: null unless the researcher has a public username AND
 * opted in -- the RPC answers both cases identically, so this never reveals which. */
export async function getPublicResearcherLinks(username: string): Promise<ExternalHandles | null> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withPublicTransaction(actor?.id ?? null, (client) => callRpc<ExternalHandles_DB>(client, "public.get_public_researcher_links", [username]));
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows[0] ? toExternalHandles(rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Recommended programs -- a literal focus_areas / hacking_interests overlap, never a
// fabricated "AI model" (see list_recommended_programs's own comment).
// ---------------------------------------------------------------------------

export async function listRecommendedPrograms(): Promise<RecommendedProgram[]> {
  const actor = await getCurrentUser();
  let rows;
  try {
    rows = await withActorTransaction(actor?.id ?? null, (client) =>
      callRpc<{
        id: string;
        organization_id: string;
        name: string;
        organization_name: string;
        status: RecommendedProgram["status"];
        description: string | null;
        focus_areas: ResearcherFocusArea[];
        updated_at: string;
      }>(client, "public.list_recommended_programs"),
    );
  } catch (error) {
    mapError(error as { message: string });
  }
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    organizationName: row.organization_name,
    status: row.status,
    description: row.description,
    focusAreas: row.focus_areas,
    updatedAt: row.updated_at,
  }));
}
