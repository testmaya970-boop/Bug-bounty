// Shape checks for researcher identity and payout fields, used by the server actions (the
// trust boundary). Blank means "not provided"; anything entered must be plausible. Junk such
// as passport "X", a 2030 birth date or country code "abc" used to reach the admin review
// queue as "pending".

export const blankOr = (rule: (value: string) => boolean) => (value: string | undefined) => !value || rule(value);

const digitsOnly = (value: string) => value.replace(/[\s-]/g, "");

export const isPhoneCountryCode = (value: string) => /^\+\d{1,3}$/.test(value);
export const isPhoneNumber = (value: string) => /^\d{6,14}$/.test(digitsOnly(value));
export const isPassportNumber = (value: string) => /^[A-Za-z0-9]{6,9}$/.test(value);

/** A real calendar date (YYYY-MM-DD), from 1900 on, of someone at least 16 years old. */
export function isPlausibleDateOfBirth(value: string, now = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || year < 1900) return false;
  const sixteenYearsAgo = new Date(Date.UTC(now.getUTCFullYear() - 16, now.getUTCMonth(), now.getUTCDate()));
  return date <= sixteenYearsAgo;
}

/** An Indian IFSC, a US ABA routing number, or a SWIFT/BIC code. */
export function isBankCode(value: string): boolean {
  const code = normalizeBankCode(value);
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code) || /^\d{9}$/.test(code) || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(code);
}

export const normalizeBankCode = (value: string) => value.replace(/\s/g, "").toUpperCase();
