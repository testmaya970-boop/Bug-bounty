import { z } from "zod";

// Organization-wide settings (db/migrations/202611040002_organization_settings.sql). The schema
// mirrors the table's checks so the form, configuration import and the server agree.

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
] as const;
export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"] as const;
export const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" }, { value: 4, label: "Thu" },
  { value: 5, label: "Fri" }, { value: 6, label: "Sat" }, { value: 7, label: "Sun" },
] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00.");

export const organizationSettingsSchema = z
  .object({
    defaultLanguage: z.enum(["en", "hi", "es", "fr", "de", "ja"]),
    timeZone: z.string().min(1).max(64),
    dateFormat: z.enum(DATE_FORMATS),
    currency: z.enum(["USD", "INR"]),
    businessHoursStart: time,
    businessHoursEnd: time,
    supportEmail: z.string().trim().max(254).email("Enter a valid email address.").or(z.literal("")),
    country: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Use a two-letter country code."),
    workingDays: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one working day.").max(7),
    defaultVisibility: z.enum(["public", "private"]),
    defaultFirstResponseHours: z.number().int().min(1).max(720),
    defaultTriageHours: z.number().int().min(1).max(2160),
    defaultResolutionDays: z.number().int().min(1).max(365),
    defaultRewardCurrency: z.enum(["USD", "INR"]),
    defaultSafeHarbor: z.boolean(),
    defaultDisclosureDays: z.number().int().min(0).max(365),
    defaultHallOfFame: z.boolean(),
  })
  .refine((s) => s.businessHoursEnd > s.businessHoursStart, { message: "Business hours must end after they start.", path: ["businessHoursEnd"] })
  .refine((s) => s.defaultTriageHours >= s.defaultFirstResponseHours, { message: "The triage target can't be shorter than the first-response target.", path: ["defaultTriageHours"] });

export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>;
export type OrganizationSettingsRecord = OrganizationSettings & { updatedAt: string | null; updatedByName: string | null };

/** The platform defaults (the table's column defaults). */
export const DEFAULT_ORGANIZATION_SETTINGS: OrganizationSettings = {
  defaultLanguage: "en",
  timeZone: "UTC",
  dateFormat: "YYYY-MM-DD",
  currency: "USD",
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  supportEmail: "",
  country: "",
  workingDays: [1, 2, 3, 4, 5],
  defaultVisibility: "private",
  defaultFirstResponseHours: 24,
  defaultTriageHours: 72,
  defaultResolutionDays: 90,
  defaultRewardCurrency: "USD",
  defaultSafeHarbor: true,
  defaultDisclosureDays: 90,
  defaultHallOfFame: true,
};

/** Camel-case settings to the snake-case keys update_organization_settings reads. */
export function toSettingsPayload(s: OrganizationSettings): Record<string, unknown> {
  return {
    default_language: s.defaultLanguage,
    time_zone: s.timeZone,
    date_format: s.dateFormat,
    currency: s.currency,
    business_hours_start: s.businessHoursStart,
    business_hours_end: s.businessHoursEnd,
    support_email: s.supportEmail,
    country: s.country,
    working_days: s.workingDays,
    default_visibility: s.defaultVisibility,
    default_first_response_hours: s.defaultFirstResponseHours,
    default_triage_hours: s.defaultTriageHours,
    default_resolution_days: s.defaultResolutionDays,
    default_reward_currency: s.defaultRewardCurrency,
    default_safe_harbor: s.defaultSafeHarbor,
    default_disclosure_days: s.defaultDisclosureDays,
    default_hall_of_fame: s.defaultHallOfFame,
  };
}
