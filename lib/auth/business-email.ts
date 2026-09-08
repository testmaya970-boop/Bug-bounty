// Common free/consumer webmail providers, rejected only for `intent: "organization"`
// signup -- a real, well-known B2B pattern (an organization account should be reachable
// at a domain that identifies the organization, not a shared consumer inbox). This is a
// blocklist, not an allowlist: any domain not on this list is accepted, including a
// small company's own custom domain this list has never heard of.
const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "gmx.com",
  "zoho.com",
  "yandex.com",
  "qq.com",
  "163.com",
  "126.com",
]);

export function isBusinessEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  if (!domain) return false;
  return !FREE_EMAIL_DOMAINS.has(domain);
}
