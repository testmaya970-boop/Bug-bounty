export type ResearcherGender = "male" | "female" | "other" | "prefer_not_to_say";
export type ResearcherAgeGroup = "under_18" | "18_30" | "31_50" | "above_50";
export type ResearcherExperienceLevel = "beginner" | "intermediate" | "advanced" | "expert";
export type ResearcherEmploymentStatus = "student" | "freelancer" | "employed" | "unemployed" | "other";
export type ResearcherFocusArea = "web_applications" | "mobile_applications" | "apis" | "networks" | "databases" | "cloud_infrastructure" | "desktop_applications" | "iot_hardware" | "other";
export type ResearcherToolCategory = "web_vulnerability_scanners" | "network_analysis_tools" | "penetration_testing_frameworks" | "exploit_development_tools" | "wireless_hacking_tools" | "social_engineering_tools" | "other";
export type ResearcherSecurityFocus = "offensive_security" | "defensive_security" | "secure_coding" | "compliance" | "threat_intelligence" | "application_security" | "other";
export type KycStatus = "not_submitted" | "pending" | "verified" | "rejected";
export type PayoutMethod = "bank_transfer" | "paypal";
export type PayoutSchedule = "immediate" | "weekly" | "monthly" | "on_threshold";
export type TaxFormType = "w9" | "w8ben" | "w8ben_e";

/** The public-read professional slice of researcher_profiles (same tier as biography) --
 * see docs/decisions/0051. */
export type ProfessionalDetails = {
  qualification: string | null;
  experienceLevel: ResearcherExperienceLevel | null;
  employmentStatus: ResearcherEmploymentStatus | null;
  linkedinUrl: string | null;
  resumeUrl: string | null;
  hackingInterests: ResearcherFocusArea[];
  hackingTools: ResearcherToolCategory[];
  securityFocus: ResearcherSecurityFocus[];
};

/** researcher_personal_details -- self-only, never org-readable. */
export type PersonalDetails = {
  gender: ResearcherGender | null;
  ageGroup: ResearcherAgeGroup | null;
};

/** get_my_kyc_status()'s shape -- booleans + statuses only, never the encrypted/raw value
 * itself (see 202609010004's own comment on why this is a function, not a raw select). */
export type KycStatusSummary = {
  phoneCountryCode: string | null;
  phoneSubmitted: boolean;
  phoneStatus: KycStatus;
  aadhaarSubmitted: boolean;
  aadhaarStatus: KycStatus;
  panSubmitted: boolean;
  panStatus: KycStatus;
  passportSubmitted: boolean;
  passportDateOfBirth: string | null;
  passportStatus: KycStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  updatedAt: string | null;
};

export type KycField = "phone" | "aadhaar" | "pan" | "passport";

/** A pending KYC submission surfaced to a platform admin -- statuses only, never a raw
 * government-ID value (see list_kyc_submissions()). */
export type KycSubmissionSummary = {
  userId: string;
  displayName: string;
  email: string | null;
  phoneStatus: KycStatus;
  aadhaarStatus: KycStatus;
  panStatus: KycStatus;
  passportStatus: KycStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
};

/** get_my_payout_details()'s shape -- the full account number never comes back to the
 * client after submission, only the last 4 digits (see 202609010004). */
export type PayoutDetailsSummary = {
  method: PayoutMethod | null;
  bankAccountHolderName: string | null;
  bankAccountLast4: string | null;
  bankIfscOrRouting: string | null;
  paypalEmail: string | null;
  payoutThresholdMinorUnits: number | null;
  payoutSchedule: PayoutSchedule;
  taxFormType: TaxFormType | null;
  taxIdLast4: string | null;
  taxFormStatus: KycStatus;
  taxFormSubmittedAt: string | null;
  taxFormReviewNote: string | null;
  updatedAt: string | null;
};

/** list_recommended_programs()'s row shape -- a literal focus_areas overlap with the
 * researcher's own hacking_interests, never a fabricated recommendation model. */
export type RecommendedProgram = {
  id: string;
  organizationId: string;
  name: string;
  organizationName: string;
  status: "draft" | "review" | "active" | "paused" | "closed";
  description: string | null;
  focusAreas: ResearcherFocusArea[];
  updatedAt: string;
};
