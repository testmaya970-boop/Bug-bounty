"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { blankOr, isBankCode, isPassportNumber, isPhoneCountryCode, isPhoneNumber, isPlausibleDateOfBirth, normalizeBankCode } from "@/lib/kyc-validation";
import {
  OrganizationServiceError,
  reviewKycField,
  reviewTaxForm,
  submitMyKyc,
  submitMyTaxForm,
  updateMyDisplayName,
  updateMyExternalHandles,
  updateMyPayoutDetails,
  updateMyPersonalDetails,
  updateMyProfessionalDetails,
  upsertMyBiography,
} from "@/services/researcher-profiles";
import { setMyPublicUsername } from "@/services/reputation";
import { EXTERNAL_PLATFORM_ORDER, normalizeExternalHandle, type ExternalHandles, type ExternalPlatform } from "@/lib/external-profiles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const displayNameSchema = z.object({ displayName: z.string().trim().min(1, "Enter a display name.").max(100, "Use 100 characters or fewer.") });
const biographySchema = z.object({ biography: z.string().trim().max(5000, "Use 5000 characters or fewer.") });

const focusAreaEnum = z.enum(["web_applications", "mobile_applications", "apis", "networks", "databases", "cloud_infrastructure", "desktop_applications", "iot_hardware", "other"]);
const toolCategoryEnum = z.enum(["web_vulnerability_scanners", "network_analysis_tools", "penetration_testing_frameworks", "exploit_development_tools", "wireless_hacking_tools", "social_engineering_tools", "other"]);
const securityFocusEnum = z.enum(["offensive_security", "defensive_security", "secure_coding", "compliance", "threat_intelligence", "application_security", "other"]);

const professionalDetailsSchema = z.object({
  qualification: z.string().trim().max(200).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced", "expert"]).optional(),
  employmentStatus: z.enum(["student", "freelancer", "employed", "unemployed", "other"]).optional(),
  linkedinUrl: z.string().trim().max(300).optional(),
  resumeUrl: z.string().trim().max(500).optional(),
  hackingInterests: z.array(focusAreaEnum).optional(),
  hackingTools: z.array(toolCategoryEnum).optional(),
  securityFocus: z.array(securityFocusEnum).optional(),
});

const personalDetailsSchema = z.object({
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  ageGroup: z.enum(["under_18", "18_30", "31_50", "above_50"]).optional(),
});

const kycSchema = z.object({
  phoneCountryCode: z.string().trim().max(8).optional().refine(blankOr(isPhoneCountryCode), "Enter a country code like +91."),
  phoneNumber: z.string().trim().max(20).optional().refine(blankOr(isPhoneNumber), "Enter the phone number as 6 to 14 digits."),
  // No aadhaarNumber: Aadhaar is verified only through DigiLocker (/settings/identity); the
  // database refuses new numbers too (202610260005).
  panNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(10)
    .optional()
    .refine(blankOr((v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)), "Enter the 10-character PAN, like ABCDE1234F."),
  passportNumber: z.string().trim().max(20).optional().refine(blankOr(isPassportNumber), "Enter the passport number: 6 to 9 letters and numbers."),
  passportDateOfBirth: z.string().trim().optional().refine(blankOr((v) => isPlausibleDateOfBirth(v)), "Enter your real date of birth. You must be at least 16."),
});

const payoutDetailsSchema = z.object({
  method: z.enum(["bank_transfer", "paypal"]),
  bankAccountHolderName: z.string().trim().max(160).optional(),
  bankAccountNumber: z.string().trim().max(30).optional(),
  bankIfscOrRouting: z
    .string()
    .trim()
    .max(34)
    .optional()
    .refine(blankOr(isBankCode), "Enter an IFSC (like HDFC0001234), a 9-digit US routing number, or a SWIFT code.")
    .transform((v) => (v ? normalizeBankCode(v) : v)),
  paypalEmail: z.string().trim().max(320).optional(),
  payoutThresholdMinorUnits: z.coerce.number().int().positive().optional(),
  payoutSchedule: z.enum(["immediate", "weekly", "monthly", "on_threshold"]).optional(),
});

const taxFormSchema = z.object({
  taxFormType: z.enum(["w9", "w8ben", "w8ben_e"]),
  taxId: z.string().trim().min(4, "Enter a valid tax identifier.").max(40),
});

const externalHandlesSchema = z.object({
  // Raw input: a handle, "@handle", or a pasted profile URL. Normalized per platform below.
  handles: z.record(z.enum(EXTERNAL_PLATFORM_ORDER as [ExternalPlatform, ...ExternalPlatform[]]), z.string().max(300)),
  showExternalLinks: z.boolean(),
});

const publicUsernameSchema = z.object({ username: z.string().trim().max(30) });

const reviewKycSchema = z.object({
  targetUserId: z.string().uuid(),
  field: z.enum(["phone", "aadhaar", "pan", "passport"]),
  decision: z.enum(["verified", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});

export async function updateMyDisplayNameAction(input: z.infer<typeof displayNameSchema>): Promise<ActionResult<void>> {
  const parsed = displayNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await updateMyDisplayName(parsed.data.displayName);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function updateMyBiographyAction(input: z.infer<typeof biographySchema>): Promise<ActionResult<void>> {
  const parsed = biographySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await upsertMyBiography(parsed.data.biography);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function updateMyProfessionalDetailsAction(input: z.infer<typeof professionalDetailsSchema>): Promise<ActionResult<void>> {
  const parsed = professionalDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await updateMyProfessionalDetails(parsed.data);
    revalidatePath("/settings");
    revalidatePath("/programs");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function updateMyPersonalDetailsAction(input: z.infer<typeof personalDetailsSchema>): Promise<ActionResult<void>> {
  const parsed = personalDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await updateMyPersonalDetails(parsed.data);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function submitMyKycAction(input: z.infer<typeof kycSchema>): Promise<ActionResult<void>> {
  const parsed = kycSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await submitMyKyc(parsed.data);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function updateMyPayoutDetailsAction(input: z.input<typeof payoutDetailsSchema>): Promise<ActionResult<void>> {
  const parsed = payoutDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await updateMyPayoutDetails(parsed.data);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

export async function submitMyTaxFormAction(input: z.infer<typeof taxFormSchema>): Promise<ActionResult<void>> {
  const parsed = taxFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await submitMyTaxForm(parsed.data.taxFormType, parsed.data.taxId);
    revalidatePath("/settings");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Self-reported, explicitly unverified -- see services/researcher-profiles.ts's own
 * comment. Never read by any trust-relevant code path. Every handle is normalized here (a
 * pasted profile URL becomes the bare handle; wrong hosts and non-http(s) schemes are
 * refused) before the RPC re-checks the stored formats. Errors name the field. */
export async function updateMyExternalHandlesAction(input: z.infer<typeof externalHandlesSchema>): Promise<ActionResult<{ handles: ExternalHandles }> & { field?: ExternalPlatform }> {
  const parsed = externalHandlesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  const handles = {} as ExternalHandles;
  for (const platform of EXTERNAL_PLATFORM_ORDER) {
    const result = normalizeExternalHandle(platform, parsed.data.handles[platform] ?? "");
    if (!result.ok) return { ok: false, code: "INVALID_HANDLE", message: result.message, field: platform };
    handles[`${platform}Handle`] = result.handle;
  }

  try {
    await updateMyExternalHandles({ ...handles, showExternalLinks: parsed.data.showExternalLinks });
    revalidatePath("/settings/external-services");
    revalidatePath("/profile");
    return { ok: true, data: { handles } };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Sets or clears (empty string) the caller's real, public leaderboard/profile username --
 * see docs/decisions/0065. The RPC itself validates format and uniqueness; this action
 * only maps its INVALID_USERNAME/USERNAME_TAKEN errors back to the form. */
export async function setMyPublicUsernameAction(input: z.infer<typeof publicUsernameSchema>): Promise<ActionResult<void>> {
  const parsed = publicUsernameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await setMyPublicUsername(parsed.data.username);
    revalidatePath("/settings");
    revalidatePath("/researchers");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

/** Platform-admin-only -- the RPC itself re-checks private.is_platform_admin() and will
 * reject a non-admin caller regardless of this action even being reachable. */
export async function reviewKycFieldAction(input: z.infer<typeof reviewKycSchema>): Promise<ActionResult<void>> {
  const parsed = reviewKycSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await reviewKycField(parsed.data.targetUserId, parsed.data.field, parsed.data.decision, parsed.data.note);
    revalidatePath("/platform/kyc");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}

const reviewTaxFormSchema = z.object({
  targetUserId: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  note: z.string().trim().max(1000).optional(),
});

/** Platform-admin-only -- review_tax_form re-checks private.is_platform_admin(). */
export async function reviewTaxFormAction(input: z.infer<typeof reviewTaxFormSchema>): Promise<ActionResult<void>> {
  const parsed = reviewTaxFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };

  try {
    await reviewTaxForm(parsed.data.targetUserId, parsed.data.decision, parsed.data.note);
    revalidatePath("/platform/kyc");
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof OrganizationServiceError) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
}
