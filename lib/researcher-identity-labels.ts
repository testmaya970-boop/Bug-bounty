import type {
  KycField,
  KycStatus,
  PayoutMethod,
  ResearcherAgeGroup,
  ResearcherEmploymentStatus,
  ResearcherExperienceLevel,
  ResearcherFocusArea,
  ResearcherGender,
  ResearcherSecurityFocus,
  ResearcherToolCategory,
} from "@/types/researcher-identity";

// Pure presentation logic, same convention as lib/report-weakness-labels.ts -- fixed,
// real taxonomies, never free text. See docs/decisions/0051.

const GENDER_LABELS: Record<ResearcherGender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};
export const GENDER_ORDER: ResearcherGender[] = ["male", "female", "other", "prefer_not_to_say"];
export function genderLabel(value: ResearcherGender): string {
  return GENDER_LABELS[value];
}

const AGE_GROUP_LABELS: Record<ResearcherAgeGroup, string> = {
  under_18: "Under 18",
  "18_30": "18-30",
  "31_50": "31-50",
  above_50: "Above 50",
};
export const AGE_GROUP_ORDER: ResearcherAgeGroup[] = ["under_18", "18_30", "31_50", "above_50"];
export function ageGroupLabel(value: ResearcherAgeGroup): string {
  return AGE_GROUP_LABELS[value];
}

const EXPERIENCE_LEVEL_LABELS: Record<ResearcherExperienceLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};
export const EXPERIENCE_LEVEL_ORDER: ResearcherExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];
export function experienceLevelLabel(value: ResearcherExperienceLevel): string {
  return EXPERIENCE_LEVEL_LABELS[value];
}

const EMPLOYMENT_STATUS_LABELS: Record<ResearcherEmploymentStatus, string> = {
  student: "Student",
  freelancer: "Freelancer",
  employed: "Employed",
  unemployed: "Unemployed",
  other: "Other",
};
export const EMPLOYMENT_STATUS_ORDER: ResearcherEmploymentStatus[] = ["student", "freelancer", "employed", "unemployed", "other"];
export function employmentStatusLabel(value: ResearcherEmploymentStatus): string {
  return EMPLOYMENT_STATUS_LABELS[value];
}

const FOCUS_AREA_LABELS: Record<ResearcherFocusArea, string> = {
  web_applications: "Websites / web applications",
  mobile_applications: "Mobile applications",
  apis: "APIs",
  networks: "Networks",
  databases: "Databases",
  cloud_infrastructure: "Cloud infrastructure",
  desktop_applications: "Desktop / native applications",
  iot_hardware: "IoT / hardware",
  other: "Other",
};
export const FOCUS_AREA_ORDER: ResearcherFocusArea[] = ["web_applications", "mobile_applications", "apis", "networks", "databases", "cloud_infrastructure", "desktop_applications", "iot_hardware", "other"];
export function focusAreaLabel(value: ResearcherFocusArea): string {
  return FOCUS_AREA_LABELS[value];
}

const TOOL_CATEGORY_LABELS: Record<ResearcherToolCategory, string> = {
  web_vulnerability_scanners: "Web vulnerability scanners",
  network_analysis_tools: "Network analysis tools",
  penetration_testing_frameworks: "Penetration testing frameworks",
  exploit_development_tools: "Exploit development tools",
  wireless_hacking_tools: "Wireless hacking tools",
  social_engineering_tools: "Social engineering tools",
  other: "Other",
};
export const TOOL_CATEGORY_ORDER: ResearcherToolCategory[] = ["web_vulnerability_scanners", "network_analysis_tools", "penetration_testing_frameworks", "exploit_development_tools", "wireless_hacking_tools", "social_engineering_tools", "other"];
export function toolCategoryLabel(value: ResearcherToolCategory): string {
  return TOOL_CATEGORY_LABELS[value];
}

const SECURITY_FOCUS_LABELS: Record<ResearcherSecurityFocus, string> = {
  offensive_security: "Offensive security",
  defensive_security: "Defensive security",
  secure_coding: "Secure coding / SDLC",
  compliance: "Compliance (ISO, PCI, SOC2, etc.)",
  threat_intelligence: "Threat intelligence",
  application_security: "Application security",
  other: "Other",
};
export const SECURITY_FOCUS_ORDER: ResearcherSecurityFocus[] = ["offensive_security", "defensive_security", "secure_coding", "compliance", "threat_intelligence", "application_security", "other"];
export function securityFocusLabel(value: ResearcherSecurityFocus): string {
  return SECURITY_FOCUS_LABELS[value];
}

const KYC_STATUS_LABELS: Record<KycStatus, string> = {
  not_submitted: "Not submitted",
  pending: "Pending review",
  verified: "Verified",
  rejected: "Rejected",
};
export function kycStatusLabel(value: KycStatus): string {
  return KYC_STATUS_LABELS[value];
}

export const KYC_FIELD_LABELS: Record<KycField, string> = {
  phone: "Phone number",
  aadhaar: "Aadhaar",
  pan: "PAN",
  passport: "Passport",
};

const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  bank_transfer: "Bank transfer",
  paypal: "PayPal",
};
export function payoutMethodLabel(value: PayoutMethod): string {
  return PAYOUT_METHOD_LABELS[value];
}
