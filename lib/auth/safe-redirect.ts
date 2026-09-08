/** Open-redirect protection: only a same-origin, root-relative path is ever honored as a
 * post-auth destination. `//evil.test` is rejected -- browsers treat a leading `//` as a
 * protocol-relative URL, not a path, so `redirect("//evil.test")` would silently leave
 * the app entirely. Previously duplicated identically in app/sign-in/page.tsx and
 * actions/auth.ts; consolidated here as part of the 2026 authentication experience slice
 * so the one security-relevant check has exactly one implementation. */
export function isSafeRedirect(path: string | undefined | null): path is string {
  return Boolean(path) && path!.startsWith("/") && !path!.startsWith("//");
}
