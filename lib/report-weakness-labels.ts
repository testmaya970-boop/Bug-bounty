import type { ReportWeaknessType } from "@/types/report";

// Pure presentation logic, deliberately not in services/reports.ts (server-only) -- the
// same reason lib/report-status.ts exists separately. A real, fixed taxonomy (not
// exhaustive CWE coverage, but the common categories a bounty program actually triages
// against), never a free-text field -- see docs/decisions/0047.
const WEAKNESS_TYPE_LABELS: Record<ReportWeaknessType, string> = {
  cross_site_scripting: "Cross-Site Scripting (XSS)",
  sql_injection: "SQL Injection",
  ssrf: "Server-Side Request Forgery (SSRF)",
  idor: "Insecure Direct Object Reference (IDOR)",
  broken_authentication: "Broken Authentication",
  broken_access_control: "Broken Access Control",
  csrf: "Cross-Site Request Forgery (CSRF)",
  remote_code_execution: "Remote Code Execution",
  information_disclosure: "Information Disclosure",
  insecure_deserialization: "Insecure Deserialization",
  security_misconfiguration: "Security Misconfiguration",
  injection_other: "Other Injection",
  business_logic: "Business Logic Error",
  denial_of_service: "Denial of Service",
  cryptographic_failure: "Cryptographic Failure",
  insecure_file_upload: "Insecure File Upload",
  api_security: "API Security",
  other: "Other",
};

export const WEAKNESS_TYPE_ORDER: ReportWeaknessType[] = [
  "cross_site_scripting",
  "sql_injection",
  "ssrf",
  "idor",
  "broken_authentication",
  "broken_access_control",
  "csrf",
  "remote_code_execution",
  "information_disclosure",
  "insecure_deserialization",
  "security_misconfiguration",
  "injection_other",
  "business_logic",
  "denial_of_service",
  "cryptographic_failure",
  "insecure_file_upload",
  "api_security",
  "other",
];

export function weaknessTypeLabel(weaknessType: ReportWeaknessType): string {
  return WEAKNESS_TYPE_LABELS[weaknessType];
}
