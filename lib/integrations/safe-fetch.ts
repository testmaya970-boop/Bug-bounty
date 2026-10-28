import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { isIP, BlockList } from "node:net";

// One outbound HTTP client for every customer-supplied URL (webhook endpoints, Teams
// Workflows URLs, self-managed GitLab, ServiceNow instances). The customer chooses the URL, so
// without these rules an organization admin could point the worker at the internal network or
// a cloud metadata service (SSRF):
//   - https only, on 443 or 8443; no credentials in the URL
//   - every address the name resolves to must be public, checked AT CONNECT TIME through the
//     socket's own lookup, so a DNS answer can't change between the check and the connection
//     (DNS rebinding)
//   - redirects are never followed (a 3xx is just a failed delivery)
//   - 10 s timeout, response body read up to 64 KiB
// Off production, ALLOW_LOOPBACK_DELIVERY=1 lets the end-to-end tests deliver to a local
// receiver; sandboxAllowed()'s production rule applies, so it can't switch on in a deployment.

const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  // IPv4-mapped (::ffff:0:0/96) is deliberately absent: BlockList would match every IPv4
  // address against it. isPublicAddress() unwraps mapped addresses and judges the IPv4 instead.
  ["::", 128], ["::1", 128], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) BLOCKED.addSubnet(net, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    // IPv4-mapped IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address it maps to.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return isPublicAddress(mapped[1]);
    return !BLOCKED.check(address, "ipv6");
  }
  return !BLOCKED.check(address, "ipv4");
}

function loopbackAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  const loopbackOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(env.APP_ORIGIN ?? "");
  const sandbox = env.NODE_ENV !== "production" || (env.LOCAL_PROD_TEST === "1" && loopbackOrigin);
  return sandbox && env.ALLOW_LOOPBACK_DELIVERY === "1";
}

export class UnsafeUrlError extends Error {}

/** Shape check only (no DNS): what settings forms run before saving a URL. */
export function checkOutboundUrl(raw: string, env: NodeJS.ProcessEnv = process.env): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Enter a full URL starting with https://.");
  }
  const loopback = loopbackAllowed(env) && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) throw new UnsafeUrlError("The URL must start with https://.");
  if (url.username || url.password) throw new UnsafeUrlError("The URL can't contain a username or password.");
  if (!loopback && url.port && url.port !== "443" && url.port !== "8443") throw new UnsafeUrlError("Use the standard HTTPS port (443 or 8443).");
  if (!loopback && isIP(url.hostname.replace(/^\[|\]$/g, "")) !== 0 && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) {
    throw new UnsafeUrlError("That address is private or reserved.");
  }
  if (!loopback && /(^|\.)(localhost|local|internal|intranet|home\.arpa)$/i.test(url.hostname)) throw new UnsafeUrlError("That host name is internal.");
  return url;
}

export type SafeResponse = { status: number; body: string; headers: Record<string, string | string[] | undefined>; durationMs: number };

/** POST/GET to a customer-supplied URL under the rules above. Throws on a blocked URL or a
 * network failure; returns any HTTP status (including 3xx, which is never followed). */
export async function safeFetch(
  rawUrl: string,
  init: { method?: "GET" | "POST" | "PATCH" | "PUT"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<SafeResponse> {
  const url = checkOutboundUrl(rawUrl, env);
  const loopback = loopbackAllowed(env) && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  const maxBytes = init.maxBytes ?? 64 * 1024;
  const started = Date.now();

  // Validates every address at the moment the socket connects (defeats DNS rebinding).
  const guardedLookup = (hostname: string, options: object, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    dnsLookup(hostname, { all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = addresses as LookupAddress[];
      const bad = list.find((a) => !isPublicAddress(a.address));
      if (!loopback && (list.length === 0 || bad)) return callback(Object.assign(new UnsafeUrlError(`Refused to connect: ${hostname} resolves to a private or reserved address.`), { code: "EUNSAFE" }), "", 0);
      if ((options as { all?: boolean }).all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };

  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  return new Promise<SafeResponse>((resolve, reject) => {
    const req = send(
      url,
      { method: init.method ?? "POST", headers: { "User-Agent": "Unpatched-Webhooks/1.0", ...init.headers }, lookup: guardedLookup as never, timeout: init.timeoutMs ?? 10_000 },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size <= maxBytes) chunks.push(chunk);
          else res.destroy();
        });
        const finish = () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers, durationMs: Date.now() - started });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
