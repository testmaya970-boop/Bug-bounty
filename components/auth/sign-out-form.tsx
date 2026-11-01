"use client";

import React from "react";
import { signOutAction } from "../../actions/auth";

/**
 * Sign-out ends in a full page load, not redirect(): a soft navigation keeps Next's client
 * router cache, so Back after signing out could show the private pages still in memory.
 * location.replace also drops the current entry from history.
 */
export function SignOutForm({ buttonClassName }: { buttonClassName: string }) {
  return (
    <form
      action={async () => {
        await signOutAction();
        history.replaceState = () => {};
        window.location.replace("/sign-in");
      }}
    >
      <button type="submit" className={buttonClassName}>
        Sign out
      </button>
    </form>
  );
}
