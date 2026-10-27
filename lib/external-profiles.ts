/**
 * External security-platform profiles a researcher can list (self-reported, never verified,
 * never a trust signal). One definition per platform: the handle format and the only host a
 * pasted profile URL may come from. Used by the settings form (instant feedback) and by the
 * server action (the authoritative check); the database RPC repeats the handle formats so a
 * direct call cannot store anything else.
 *
 * A user may type a bare handle ("jordan", "@jordan") or paste their profile URL; either way
 * only the handle is stored, and the link is always rebuilt from the platform's own base URL,
 * so a stored value can never point anywhere else or use another scheme.
 */
export type ExternalPlatform = "hackerone" | "bugcrowd" | "cobalt" | "github" | "gitlab" | "x" | "hackthebox";

export type ExternalHandles = Record<`${ExternalPlatform}Handle`, string | null>;

type PlatformDefinition = {
  label: string;
  hosts: string[];
  /** Path prefix before the handle in a profile URL ("" when the handle is the first segment). */
  pathPrefix: string;
  pattern: RegExp;
  formatHint: string;
  url: (handle: string) => string;
};

export const EXTERNAL_PLATFORMS: Record<ExternalPlatform, PlatformDefinition> = {
  hackerone: {
    label: "HackerOne",
    hosts: ["hackerone.com", "www.hackerone.com"],
    pathPrefix: "",
    pattern: /^[A-Za-z0-9_-]{1,40}$/,
    formatHint: "Letters, numbers, - and _.",
    url: (h) => `https://hackerone.com/${h}`,
  },
  bugcrowd: {
    label: "Bugcrowd",
    hosts: ["bugcrowd.com", "www.bugcrowd.com"],
    pathPrefix: "",
    pattern: /^[A-Za-z0-9_-]{1,40}$/,
    formatHint: "Letters, numbers, - and _.",
    url: (h) => `https://bugcrowd.com/${h}`,
  },
  cobalt: {
    label: "Cobalt",
    hosts: ["app.cobalt.io", "cobalt.io"],
    pathPrefix: "",
    pattern: /^[A-Za-z0-9._-]{1,40}$/,
    formatHint: "Letters, numbers, ., - and _.",
    url: (h) => `https://app.cobalt.io/${h}`,
  },
  github: {
    label: "GitHub",
    hosts: ["github.com", "www.github.com"],
    pathPrefix: "",
    // GitHub's own rule: alphanumerics and single hyphens, no leading/trailing hyphen, 39 max.
    pattern: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/,
    formatHint: "Letters, numbers and single hyphens, up to 39 characters.",
    url: (h) => `https://github.com/${h}`,
  },
  gitlab: {
    label: "GitLab",
    hosts: ["gitlab.com", "www.gitlab.com"],
    pathPrefix: "",
    pattern: /^[A-Za-z0-9._-]{1,40}$/,
    formatHint: "Letters, numbers, ., - and _.",
    url: (h) => `https://gitlab.com/${h}`,
  },
  x: {
    label: "X",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
    pathPrefix: "",
    pattern: /^[A-Za-z0-9_]{1,15}$/,
    formatHint: "Letters, numbers and _, up to 15 characters.",
    url: (h) => `https://x.com/${h}`,
  },
  hackthebox: {
    label: "Hack The Box",
    hosts: ["app.hackthebox.com", "hackthebox.com", "www.hackthebox.com"],
    pathPrefix: "users/",
    pattern: /^[A-Za-z0-9._-]{1,40}$/,
    formatHint: "Your Hack The Box user ID or name.",
    url: (h) => `https://app.hackthebox.com/users/${h}`,
  },
};

export const EXTERNAL_PLATFORM_ORDER: ExternalPlatform[] = ["hackerone", "bugcrowd", "cobalt", "github", "gitlab", "x", "hackthebox"];

export type NormalizedHandle = { ok: true; handle: string | null } | { ok: false; message: string };

/** Empty input clears the field (null). A URL must be https/http on the platform's own host. */
export function normalizeExternalHandle(platform: ExternalPlatform, raw: string): NormalizedHandle {
  const def = EXTERNAL_PLATFORMS[platform];
  const value = raw.trim();
  if (!value) return { ok: true, handle: null };

  let candidate = value;
  const looksLikeUrl = /^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes("/") || def.hosts.some((h) => value.toLowerCase().startsWith(h));
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    } catch {
      return { ok: false, message: `Enter your ${def.label} username or profile link.` };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: `${def.label} links must start with https://.` };
    if (!def.hosts.includes(url.hostname.toLowerCase())) return { ok: false, message: `That isn't a ${def.label} link. Paste a link on ${def.hosts[0]}, or just your username.` };
    let path = url.pathname.replace(/^\/+/, "");
    if (def.pathPrefix) {
      if (!path.toLowerCase().startsWith(def.pathPrefix)) return { ok: false, message: `Paste your ${def.label} profile link (${def.url("…")}).` };
      path = path.slice(def.pathPrefix.length);
    }
    try {
      candidate = decodeURIComponent(path.split("/")[0] ?? "");
    } catch {
      return { ok: false, message: `Enter your ${def.label} username or profile link.` };
    }
  }
  candidate = candidate.replace(/^@/, "");
  if (!def.pattern.test(candidate)) return { ok: false, message: `That isn't a valid ${def.label} username. ${def.formatHint}` };
  return { ok: true, handle: candidate };
}

/** The display link for a stored handle, or null when none is set. */
export function externalProfileUrl(platform: ExternalPlatform, handle: string | null): string | null {
  return handle ? EXTERNAL_PLATFORMS[platform].url(handle) : null;
}
