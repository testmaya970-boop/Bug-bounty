import React from "react";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { EXTERNAL_PLATFORMS, EXTERNAL_PLATFORM_ORDER, type ExternalHandles } from "../../lib/external-profiles";

/** A researcher's self-reported profiles on other platforms. Each link is rebuilt from the
 * platform's own base URL (never a stored URL), and marked ugc/nofollow: these are
 * user-supplied and unverified. Renders nothing when no handle is set. */
export function ExternalProfileLinks({ handles }: { handles: ExternalHandles }) {
  const entries = EXTERNAL_PLATFORM_ORDER.flatMap((platform) => {
    const handle = handles[`${platform}Handle`];
    return handle ? [{ platform, handle, url: EXTERNAL_PLATFORMS[platform].url(handle) }] : [];
  });
  if (entries.length === 0) return null;
  return (
    <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {entries.map(({ platform, handle, url }) => (
        <li key={platform} className="min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className="group flex min-h-11 items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 transition-colors duration-150 hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-ink-muted">{EXTERNAL_PLATFORMS[platform].label}</span>
              <span className="block truncate font-mono text-sm text-ink">{handle}</span>
            </span>
            <ArrowSquareOut aria-hidden="true" className="size-4 shrink-0 text-ink-muted group-hover:text-ink" />
            <span className="sr-only">(opens {EXTERNAL_PLATFORMS[platform].label} in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
