import React from "react";
import { Avatar } from "./navigation";

/** An organization's logo in a fixed square box: any aspect ratio fits whole (object-contain,
 * never stretched or cropped) on a neutral backing, so wide, tall and square logos all sit on
 * the same footprint as the letter monogram used when there's no logo. `version` comes from
 * getOrganizationLogoVersions; absent means no logo. */
export function OrgLogo({ organizationId, name, version, size = "md" }: { organizationId: string; name: string; version?: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-12" : "size-9";
  if (!version) {
    return (
      <span className={`inline-flex shrink-0 ${box} items-center justify-center [&>span]:size-full`}>
        <Avatar name={name} tinted />
      </span>
    );
  }
  return (
    <span className={`inline-flex shrink-0 ${box} items-center justify-center overflow-hidden rounded-md border border-border bg-white p-1`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny same-origin image; next/image would add a resize pipeline for nothing */}
      <img src={`/api/organizations/${organizationId}/logo?v=${version}`} alt={`${name} logo`} width={48} height={48} loading="lazy" decoding="async" className="size-full object-contain" />
    </span>
  );
}
