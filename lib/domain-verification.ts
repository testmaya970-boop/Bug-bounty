// DNS TXT ownership proof for organization domains (202610260008). Pure, so it is unit-testable;
// the lookup itself lives in services/organization-domains.ts.

export const TXT_PREFIX = "unpatched-verification=";

export function txtRecordName(domain: string): string {
  return `_unpatched-challenge.${domain}`;
}

export function txtRecordValue(token: string): string {
  return `${TXT_PREFIX}${token}`;
}

/** resolveTxt returns each record as chunks (long values are split at 255 bytes). */
export function txtRecordsContainToken(records: string[][], token: string): boolean {
  const expected = txtRecordValue(token);
  return records.some((chunks) => chunks.join("").trim() === expected);
}
