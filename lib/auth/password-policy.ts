/** The one password rule for every place a password is set (sign-up, reset, change):
 * at least 12 characters with a letter, a number and a special character. Enforced by
 * the server actions; the forms show the same messages. Sign-in never checks it, so
 * accounts created under the older length-only rule can still sign in. */
export const PASSWORD_RULE_TEXT = "At least 12 characters, with a letter, a number and a special character.";

export function passwordProblem(password: string): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (!/\p{L}/u.test(password)) return "Add at least one letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  if (!/[^\p{L}\d\s]/u.test(password)) return "Add at least one special character (e.g. ! @ # $).";
  return null;
}
