/** Open-redirect protection: only a same-origin, root-relative path is ever honored as a
 * post-auth destination. `//evil.test` is rejected -- browsers treat a leading `//` as a
 * protocol-relative URL, not a path, so `redirect("//evil.test")` would silently leave
 * the app entirely. Previously duplicated identically in app/sign-in/page.tsx and
 * actions/auth.ts; consolidated here as part of the 2026 authentication experience slice
 * so the one security-relevant check has exactly one implementation. */
export function isSafeRedirect(path: string | undefined | null): path is string {
  if (!path || !path.startsWith("/")) return false;
  // Browsers read "\" as "/" and drop tabs/newlines, so "/\evil.test" and "/<TAB>/evil.test"
  // both become "//evil.test". Resolve it the way the browser will and require our origin.
  const base = "https://unpatched.invalid";
  try {
    return new URL(path, base).origin === base && !/[\\\u0000-\u001f\u007f]/.test(path);
  } catch {
    return false;
  }
}
