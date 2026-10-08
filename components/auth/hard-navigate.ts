"use client";

/**
 * A full-page navigation after a Server Action that just set the session cookie (sign-in,
 * signup code verification -- see docs/decisions/0077 for why it must be a real
 * navigation, not router.push/redirect()).
 *
 * Setting the cookie makes Next's router refresh the current page, and that refresh can
 * land after the navigation has started and call history.replaceState -- which WebKit
 * (iPhone Safari) treats as cancelling the pending navigation, leaving the user on the
 * form. Captured live, ~1 in 30 iPhone runs: POST action -> GET destination starts ->
 * replaceState(current url) -> stuck. Waiting for React's commit did not help (the
 * refresh is async). This page is being replaced, so it stops rewriting its own history.
 */
export function hardNavigate(destination: string): void {
  history.replaceState = () => {};
  history.pushState = () => {};
  window.location.assign(destination);
}
