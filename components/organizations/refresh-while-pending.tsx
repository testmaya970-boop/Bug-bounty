"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while a payment waits for the gateway's confirmation,
 * for up to two minutes. The status shown always comes from the server, never from the URL. */
export function RefreshWhilePending({ everyMs = 4000, forMs = 120_000 }: { everyMs?: number; forMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > forMs) clearInterval(id);
      else router.refresh();
    }, everyMs);
    return () => clearInterval(id);
  }, [router, everyMs, forMs]);
  return null;
}
