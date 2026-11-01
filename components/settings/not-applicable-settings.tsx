import React from "react";
import { EmptyState } from "../ui/feedback";

/** An honest disclosure that no such feature exists yet -- never fake data standing in
 * for a real one. See docs/decisions/0055: Unpatched is a vulnerability-disclosure
 * platform, not every one of HackerOne's own features has a real Unpatched equivalent,
 * and fabricating one to fill the page would violate this project's own standing rule. */
export function NotApplicableSettings({ feature }: { feature: string }) {
  return <EmptyState title={`${feature} isn't part of Unpatched yet`}>This page exists so the setting is discoverable, but there's no real feature behind it yet. Nothing here is fabricated to fill the space.</EmptyState>;
}
