// Local HTTPS in front of a `next start`, the way a dev tunnel fronts it for a phone.
// Needed for the iPhone (WebKit) phone tests: a production build marks the session cookie
// Secure, and WebKit -- unlike Chromium -- won't send a Secure cookie to http://127.0.0.1.
//
//   openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=127.0.0.1 -keyout key.pem -out cert.pem
//   node scripts/https-proxy.mjs <listenPort> <targetPort> <key.pem> <cert.pem>
import { createServer } from "node:https";
import { request } from "node:http";
import { readFileSync } from "node:fs";

const [listenPort, targetPort, keyFile, certFile] = process.argv.slice(2);
if (!certFile) throw new Error("usage: node scripts/https-proxy.mjs <listenPort> <targetPort> <key.pem> <cert.pem>");

createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
  // Host is passed through unchanged so Next's Server Action origin check still matches.
  const upstream = request(
    { host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers: { ...req.headers, "x-forwarded-proto": "https" } },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  // An upstream reset after the response started (a client hanging up mid-stream) must not
  // crash the proxy: answering again would throw ERR_HTTP_HEADERS_SENT and take down every
  // later test. Just drop that one response.
  upstream.on("error", () => (res.headersSent ? res.destroy() : res.writeHead(502).end()));
  req.on("error", () => upstream.destroy());
  req.pipe(upstream);
}).listen(Number(listenPort), "127.0.0.1", () => console.log(`https://127.0.0.1:${listenPort} -> http://127.0.0.1:${targetPort}`));
