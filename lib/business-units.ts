// Business-unit categories for an engagement. Must match the check on programs.business_unit
// (db/migrations/202611040001_program_ownership_details.sql).
export const BUSINESS_UNITS = [
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "security", label: "Security" },
  { value: "it_infrastructure", label: "IT and infrastructure" },
  { value: "cloud_platform", label: "Cloud platform" },
  { value: "payments_finance", label: "Payments and finance" },
  { value: "mobile", label: "Mobile" },
  { value: "data_ai", label: "Data and AI" },
  { value: "customer_facing_web", label: "Customer-facing web" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Other" },
] as const;

export type BusinessUnit = (typeof BUSINESS_UNITS)[number]["value"];
export const BUSINESS_UNIT_VALUES = BUSINESS_UNITS.map((b) => b.value) as [BusinessUnit, ...BusinessUnit[]];
