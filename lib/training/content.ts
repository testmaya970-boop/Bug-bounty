/**
 * The training content library (docs/decisions/0066) -- free lesson content closing the
 * "no Hacker101/Bugcrowd-University equivalent" gap the HackerOne/Bugcrowd feature-parity
 * review found. Real, authored, static content, not a mock/fixture standing in for a
 * future query: an article's shape (title, body, category, estimated read time) has no
 * need for a database row's mutability or per-user state, so this is a typed array in the
 * repository, maintained the same way DESIGN.md or AGENTS.md are -- edited and redeployed,
 * never a placeholder for "a real CMS later."
 *
 * Reuses `CtfCategoryId` from lib/mock/ctf.ts rather than a second, parallel category
 * enum, so one category filter works across both /learn and /ctf and a future cross-link
 * needs no data-shape reconciliation.
 */

import type { CtfCategoryId } from "../mock/ctf";

export type TrainingSection =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "callout"; tone: "info" | "warning"; text: string }
  | { kind: "list"; items: string[] };

export type TrainingArticle = {
  id: string;
  slug: string;
  categoryId: CtfCategoryId;
  title: string;
  summary: string;
  estimatedMinutes: number;
  publishedAt: string;
  sections: TrainingSection[];
};

export const TRAINING_ARTICLES: TrainingArticle[] = [
  {
    id: "art-web-idor",
    slug: "finding-idor-vulnerabilities",
    categoryId: "web",
    title: "Finding IDOR vulnerabilities systematically",
    summary: "Insecure direct object references are one of the highest-yield bug classes for a new researcher. Here is a repeatable process for finding them.",
    estimatedMinutes: 9,
    publishedAt: "2026-08-01",
    sections: [
      {
        kind: "paragraph",
        text: "An insecure direct object reference (IDOR) happens when an application exposes a reference to an internal object -- a database row ID, a file path, a user ID -- and lets a request act on that reference without checking whether the current user is actually authorized to touch it. It is one of the most common real-world findings because it is a logic bug, not a parsing bug: no fuzzer finds it for you.",
      },
      { kind: "heading", text: "Step 1: map every place an ID appears" },
      {
        kind: "paragraph",
        text: "Walk the application as an authenticated low-privilege user and record every URL, request body, and response that contains an identifier: order numbers, invoice IDs, message IDs, profile IDs. Browser dev tools' network tab plus a proxy history (Burp, or even your browser's own request log) is enough -- you do not need automation for this step.",
      },
      { kind: "heading", text: "Step 2: get two accounts" },
      {
        kind: "paragraph",
        text: "You cannot test authorization with one account. Create a second, unrelated account (or use a second test account if the program provides one), and for every identifier you recorded in step 1, try substituting an object that belongs to the other account.",
      },
      {
        kind: "list",
        items: [
          "Sequential IDs (order/42, order/43) are the easiest to test -- just increment or decrement.",
          "UUIDs are not automatically safe: they resist guessing, but if you can enumerate one from another response (a list endpoint, a shared link, an email), the authorization check is what matters, not the ID's unguessability.",
          "Test every HTTP method separately -- an endpoint that correctly blocks GET on someone else's object but not PUT or DELETE is a real, common pattern.",
        ],
      },
      { kind: "callout", tone: "warning", text: "Never actually delete or modify another real user's data during testing, even your own second account's, without explicit scope permission for destructive actions -- read-only substitution (GET) is almost always safe; write methods (PUT/PATCH/DELETE) need a program's explicit sign-off before you fire them at anything you don't fully control." },
      { kind: "heading", text: "Step 3: write the report as a comparison" },
      {
        kind: "paragraph",
        text: "The strongest IDOR report shows three things side by side: the request as account A, the request as account B substituting A's object ID, and the response proving B received A's data (or successfully modified it). A triager should be able to reproduce your finding in under two minutes from your report alone.",
      },
    ],
  },
  {
    id: "art-web-auth-bypass",
    slug: "authentication-logic-flaws",
    categoryId: "web",
    title: "Authentication logic flaws beyond password guessing",
    summary: "Most real authentication bypasses are not brute force -- they are logic errors in password reset, session handling, and multi-step login flows.",
    estimatedMinutes: 8,
    publishedAt: "2026-08-05",
    sections: [
      {
        kind: "paragraph",
        text: "Rate limiting and account lockouts have made pure brute-force attacks increasingly rare as a real finding. The higher-yield area is logic: does every step of a multi-step login or password-reset flow actually enforce the step before it?",
      },
      { kind: "heading", text: "Password reset flows" },
      {
        kind: "list",
        items: [
          "Can the reset token be reused after it's already been consumed once?",
          "Does the reset endpoint check that the token belongs to the account named in the request body, or only that the token is valid for *some* account?",
          "Is the token itself predictable (sequential, timestamp-derived, or a weak hash of guessable input)?",
          "Does completing a reset for account A also invalidate account A's existing sessions -- if not, a stolen session survives a password change, which defeats the point of resetting it.",
        ],
      },
      { kind: "heading", text: "Multi-factor and multi-step login" },
      {
        kind: "paragraph",
        text: "A common real bug: the server issues a session or a partial-auth token after step one (password) and only checks the second factor on the client side, or the second-factor-verification endpoint doesn't actually re-check which account the partial session belongs to. Try completing step one for account A, then submitting a second-factor code you generated for account B against A's partial session.",
      },
      { kind: "callout", tone: "info", text: "Always test with the program's own designated test accounts for MFA/reset flows -- these flows touch real email/SMS delivery and account state, so this is exactly the kind of testing that benefits most from a program's explicit test-account guidance." },
    ],
  },
  {
    id: "art-crypto-weak-jwt",
    slug: "weak-jwt-implementations",
    categoryId: "crypto",
    title: "Common weaknesses in JWT implementations",
    summary: "JSON Web Tokens are cryptographically signed, but a surprising number of real-world implementations get the verification step wrong.",
    estimatedMinutes: 7,
    publishedAt: "2026-08-08",
    sections: [
      {
        kind: "paragraph",
        text: "A JWT's signature is only meaningful if the server actually verifies it correctly, against the algorithm and key it expects -- not the algorithm and key the token claims to use. Several well-known bug classes come from servers trusting fields inside the token they should be independently enforcing.",
      },
      { kind: "heading", text: "The algorithm-confusion class" },
      {
        kind: "paragraph",
        text: 'A token\'s header names its signing algorithm (e.g. "alg": "RS256"). Some JWT libraries, if not configured to pin an expected algorithm, will happily verify a token using whatever algorithm the header claims -- including "none," or swapping an asymmetric algorithm for a symmetric one using the public key as the HMAC secret. If a server exposes its public key anywhere (a JWKS endpoint, a login response, a config file) and its JWT library is not pinned to expect RS256 specifically, an attacker who knows the public key can forge a validly-signed token.',
      },
      {
        kind: "code",
        language: "text",
        code: "1. Decode the token header/payload (base64url, no secret needed to read it).\n2. Check whether the header's `alg` can be changed to `none` or a symmetric algorithm and still verify.\n3. If an RS256 public key is discoverable, try re-signing a modified payload as HS256 using that public key as the HMAC secret.",
      },
      { kind: "heading", text: "Expiry and revocation" },
      {
        kind: "list",
        items: [
          "Does the server actually check `exp`, or only decode the token without validating it?",
          "Is there any real server-side revocation for a JWT before its stated expiry (e.g. after logout, after a password change)? A stateless JWT with no revocation list means a stolen token stays valid until it naturally expires, no matter what the user does afterward -- worth flagging as a design finding even without a forgery bug.",
        ],
      },
      { kind: "callout", tone: "warning", text: "Never submit a forged-token proof-of-concept against a live account you don't own without explicit program scope covering it -- demonstrate the forgery against your own test account's token." },
    ],
  },
  {
    id: "art-crypto-tls-misconfig",
    slug: "spotting-tls-misconfigurations",
    categoryId: "crypto",
    title: "Spotting real-world TLS misconfigurations",
    summary: "Most TLS findings aren't about breaking cryptography -- they're about certificate handling and configuration mistakes that undermine it.",
    estimatedMinutes: 6,
    publishedAt: "2026-08-12",
    sections: [
      {
        kind: "paragraph",
        text: "Modern TLS is not realistically breakable by a bug bounty researcher through pure cryptanalysis. Nearly every real TLS-adjacent finding is a configuration or implementation mistake around it, not a flaw in the protocol itself.",
      },
      {
        kind: "list",
        items: [
          "Certificate validation skipped in a mobile app or internal service client -- check whether an app accepts any certificate, or a self-signed one, when it should pin or validate against a real CA chain.",
          "Mixed content: an HTTPS page loading a script, stylesheet, or iframe over plain HTTP -- an active network attacker can tamper with that one insecure resource to compromise the otherwise-secure page.",
          "Overly permissive certificate scope: a wildcard certificate covering more subdomains than necessary, especially if some of those subdomains are lower-security (a marketing CMS, a staging environment) than the main application.",
          'Missing HSTS, or an HSTS header with a very short `max-age` -- without it, a user\'s very first visit (or any visit after the header expires) is vulnerable to being silently downgraded to plain HTTP by an attacker in the network path.',
        ],
      },
      { kind: "callout", tone: "info", text: "A missing-HSTS or mixed-content finding is usually low-to-medium severity on its own -- its real value is as evidence in a report about a larger issue (e.g. a session cookie set without the Secure flag, which mixed content or a downgrade attack could then actually expose)." },
    ],
  },
  {
    id: "art-re-static-triage",
    slug: "static-triage-before-you-run-anything",
    categoryId: "reverse-engineering",
    title: "Static triage before you run anything",
    summary: "The fastest way to waste time reverse engineering a binary is to open a debugger before you've done five minutes of static triage.",
    estimatedMinutes: 8,
    publishedAt: "2026-08-15",
    sections: [
      {
        kind: "paragraph",
        text: "Before attaching a debugger or decompiler, a few cheap static checks tell you what kind of binary you're actually looking at and save significant time.",
      },
      { kind: "heading", text: "Identify the format and architecture first" },
      {
        kind: "code",
        language: "text",
        code: "file ./target        # ELF/PE/Mach-O, architecture, static vs dynamic linking\nstrings ./target | less   # readable strings often reveal library versions, debug paths, hardcoded config\nnm -D ./target        # dynamic symbols, if not stripped\nreadelf -d ./target   # (Linux) shared library dependencies",
      },
      { kind: "heading", text: "Check for stripped symbols and common protections" },
      {
        kind: "list",
        items: [
          "Stripped binaries lose function names, which makes a decompiler's output much harder to read -- worth knowing before you commit to a manual analysis approach.",
          "Check for stack canaries, ASLR, and NX/DEP -- not because you're necessarily attacking memory safety, but because their presence or absence tells you how the binary was built and what kind of exploitation techniques are even in scope for this target.",
          "Look for embedded version strings or a changelog -- a known CVE against the exact version in front of you is a legitimate, fast path to a real finding, not a shortcut to be ashamed of.",
        ],
      },
      {
        kind: "paragraph",
        text: "Only after this triage should you decide whether static analysis (a decompiler, reading disassembly) or dynamic analysis (a debugger, tracing syscalls) is the more efficient next step for this specific binary -- the answer is different for a small stripped Linux ELF versus a large, symbol-rich Windows DLL.",
      },
    ],
  },
  {
    id: "art-re-string-obfuscation",
    slug: "recognizing-string-obfuscation-patterns",
    categoryId: "reverse-engineering",
    title: "Recognizing common string and control-flow obfuscation",
    summary: "Obfuscated malware and hardened applications reuse a small set of recognizable patterns -- learn to spot them instead of reverse-engineering from scratch every time.",
    estimatedMinutes: 7,
    publishedAt: "2026-08-18",
    sections: [
      {
        kind: "paragraph",
        text: "Obfuscation techniques repeat across targets because there are only so many practical ways to hide a string or a control-flow decision from static analysis. Recognizing the pattern is faster than fully reverse-engineering it from first principles every time.",
      },
      { kind: "heading", text: "String obfuscation" },
      {
        kind: "list",
        items: [
          "XOR with a single-byte or short repeating key against a constant blob is by far the most common pattern -- if `strings` returns almost nothing readable but the binary clearly has configuration or error messages, look for a tight loop that reads a byte, XORs it with something, and writes it to a buffer.",
          "Stack strings: instead of a single data blob, the string is built byte-by-byte via a sequence of push/mov instructions directly in the disassembly -- a decompiler often reconstructs this automatically, but if you're reading raw assembly, a long run of single-byte constant pushes is the tell.",
          "Base64 or hex-encoded constants are trivially reversible once spotted -- the tell is a string made up only of the base64 or hex character set with no readable substrings.",
        ],
      },
      { kind: "heading", text: "Control-flow flattening" },
      {
        kind: "paragraph",
        text: "A flattened control flow replaces normal branching with a large switch statement driven by a state variable, so the disassembly graph looks like a star instead of a tree. It is tedious to read manually but does not change program behavior -- the state variable's transitions are the actual logic, and tracing just that one variable through the switch is usually enough to reconstruct the real flow without reversing the flattening transformation itself.",
      },
      { kind: "callout", tone: "info", text: "Automated de-obfuscation tools exist for many of these patterns, but understanding the pattern by hand once is what lets you recognize a novel variant a tool doesn't already handle." },
    ],
  },
  {
    id: "art-pwn-stack-basics",
    slug: "stack-based-memory-corruption-basics",
    categoryId: "binary-pwn",
    title: "Stack-based memory corruption: the fundamentals",
    summary: "Before chaining a real exploit, you need a precise mental model of what actually happens to the stack during a buffer overflow.",
    estimatedMinutes: 10,
    publishedAt: "2026-08-20",
    sections: [
      {
        kind: "paragraph",
        text: "A stack-based buffer overflow happens when a program writes more data into a stack-allocated buffer than that buffer was sized for, overwriting adjacent stack memory -- other local variables, saved registers, and eventually the saved return address.",
      },
      { kind: "heading", text: "What's actually adjacent to your buffer" },
      {
        kind: "paragraph",
        text: "On a typical x86-64 stack frame, a local buffer sits below other locals, then the saved base pointer, then the saved return address, in that order as the stack grows downward. Overflowing past your buffer's bounds means, in order: corrupting other locals (which may or may not be observable), corrupting the saved base pointer, and finally corrupting the return address -- which is what actually gives you control of execution when the function returns.",
      },
      {
        kind: "code",
        language: "c",
        code: "void vulnerable(char *input) {\n  char buffer[64];\n  strcpy(buffer, input); // no bounds check -- classic case\n}",
      },
      { kind: "heading", text: "Why exact offsets matter" },
      {
        kind: "paragraph",
        text: "A working exploit needs to know precisely how many bytes separate the start of your input from the return address, on this specific binary, with this specific compiler and stack layout -- guessing is unreliable. A pattern-based cyclic string (e.g. a De Bruijn sequence, the technique behind tools like `pwntools`' `cyclic()`) lets you crash the program once, read whatever bytes ended up in the corrupted return address, and look up the exact offset that produced them, rather than manually counting bytes.",
      },
      { kind: "heading", text: "Why NX and ASLR change your options, not your fundamentals" },
      {
        kind: "list",
        items: [
          "NX (non-executable stack) means you generally cannot just jump to shellcode you wrote onto the stack -- this is why return-oriented programming (chaining existing code fragments already in the binary) became the standard technique, not a workaround for something rare.",
          "ASLR randomizes where the binary, libraries, and stack load in memory -- an exploit that hardcodes an absolute address will only work if ASLR is disabled or you've separately leaked a real address at runtime.",
        ],
      },
      { kind: "callout", tone: "warning", text: "This article covers concepts only. Only attempt memory-corruption exploitation against targets you are explicitly authorized to test -- your own lab binaries, a program's designated pwn challenges, or in-scope targets where a program has explicitly confirmed this class of testing is permitted." },
    ],
  },
  {
    id: "art-forensics-log-triage",
    slug: "log-triage-for-incident-evidence",
    categoryId: "forensics",
    title: "Log triage: finding the signal in a large log dump",
    summary: "When a program shares logs as part of an investigation, most of the file is noise. Here's a repeatable way to triage it quickly.",
    estimatedMinutes: 6,
    publishedAt: "2026-08-22",
    sections: [
      {
        kind: "paragraph",
        text: "Real application and access logs are overwhelmingly routine traffic. The skill in log-based forensics is not reading every line -- it's building a small set of filters that isolate the handful of lines that actually matter.",
      },
      { kind: "heading", text: "Start with what you already know" },
      {
        kind: "list",
        items: [
          "A known timestamp (when a report says the issue occurred) narrows a multi-gigabyte log to a tight window immediately.",
          "A known IP, user ID, or session token from your own testing gives you an exact anchor to grep for, then work outward in time from there.",
          "A known request path (the vulnerable endpoint itself) lets you isolate every hit to it and look for anomalies in parameters, timing, or response codes compared to normal traffic.",
        ],
      },
      { kind: "heading", text: "Anomaly patterns worth grepping for" },
      {
        kind: "code",
        language: "text",
        code: "# Sequential enumeration against an ID-based endpoint\ngrep '/api/orders/' access.log | awk '{print $7}' | sort | uniq -c | sort -rn | head\n\n# Unusual request volume from one source in a short window\nawk '{print $1}' access.log | sort | uniq -c | sort -rn | head\n\n# Requests with abnormal status-code patterns (many 403s then a 200)\ngrep -E ' (403|401) ' access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head",
      },
      {
        kind: "paragraph",
        text: "The goal of this stage is a short list of specific timestamps/IDs/sources worth a closer, line-by-line look -- not a conclusion. Correlate anything suspicious against a second, independent log source (application logs vs. web-server access logs, for instance) before treating a pattern as confirmed rather than coincidental.",
      },
    ],
  },
  {
    id: "art-network-scanning-etiquette",
    slug: "scanning-a-real-program-target-responsibly",
    categoryId: "network",
    title: "Scanning a real program's target responsibly",
    summary: "An aggressive default scan configuration can knock over a production service you're supposed to be testing carefully, not breaking.",
    estimatedMinutes: 6,
    publishedAt: "2026-08-25",
    sections: [
      {
        kind: "paragraph",
        text: "A default, maximally aggressive port/service scan is built for speed against a lab environment, not restraint against a live production service someone else depends on. Before pointing a scanner at any in-scope target, read the program's own rules of engagement for rate limits, timing, and explicitly disallowed techniques -- they exist specifically to prevent an accidental denial-of-service, not as bureaucratic friction.",
      },
      { kind: "heading", text: "Reasonable defaults for a first pass" },
      {
        kind: "list",
        items: [
          "Start with a slower timing template and a smaller, curated port list rather than every port at maximum parallelism -- you can always run a wider follow-up scan once you understand the target's baseline behavior under load.",
          "Avoid intrusive service/version-detection scripts on a first pass against anything you don't yet understand -- some legacy or fragile services genuinely crash or hang under aggressive probing.",
          "If a program's scope explicitly excludes certain hosts, subdomains, or techniques (a common pattern: 'no automated scanning of the payment gateway'), that exclusion is binding regardless of what your tooling's defaults would otherwise do.",
        ],
      },
      { kind: "callout", tone: "warning", text: "If you're not certain whether a specific scanning technique is within a program's rules of engagement, ask before running it -- a program would always rather answer that question in advance than deal with an unplanned outage." },
      { kind: "heading", text: "What a good network finding looks like" },
      {
        kind: "paragraph",
        text: "A strong network-layer report identifies a specific exposed service, states why its exposure is a real risk in this context (not just 'a port is open'), and includes exactly what you sent and received to reach that conclusion -- the same reproducibility standard every other report type on this platform expects.",
      },
    ],
  },
  {
    id: "art-pwn-format-string",
    slug: "format-string-vulnerabilities",
    categoryId: "binary-pwn",
    title: "Format string vulnerabilities: reading and writing memory you shouldn't",
    summary: "An unchecked format string is a much older bug class than most CTF web tracks, but it's still a genuinely instructive one for understanding memory disclosure and corruption together.",
    estimatedMinutes: 7,
    publishedAt: "2026-08-27",
    sections: [
      {
        kind: "paragraph",
        text: "A format string bug happens when user-controlled input is passed directly as the format argument to a function like `printf`, rather than as a data argument: `printf(user_input)` instead of `printf(\"%s\", user_input)`. The format string's own conversion specifiers (`%x`, `%s`, `%n`) then read arguments that were never actually passed -- which, on the calling convention's stack/register layout, means reading whatever happens to be there.",
      },
      { kind: "heading", text: "From information leak to write primitive" },
      {
        kind: "list",
        items: [
          "`%x` repeated several times leaks stack contents as hex -- often enough to find a stack canary, a saved return address, or a pointer useful for defeating ASLR.",
          "`%s` treats whatever value it reads as a pointer and dereferences it -- if you can steer a `%s` at an address you control (via prior arguments already on the stack), you get an arbitrary-read primitive.",
          "`%n` (write the number of bytes output so far to the pointed-to address) is the classic write primitive -- combined with width specifiers, an attacker can write a chosen value to a chosen address, which is a very direct path to overwriting a return address or a function pointer.",
        ],
      },
      { kind: "callout", tone: "info", text: "This is a good bug class to practice on a dedicated CTF binary before looking for it in a real target -- it rewards a precise, patient understanding of the calling convention far more than a fuzzer does." },
    ],
  },
  {
    id: "art-forensics-memory-analysis",
    slug: "memory-image-analysis-first-steps",
    categoryId: "forensics",
    title: "First steps analyzing a memory image",
    summary: "A raw memory dump looks like noise until you know which tools and questions turn it into a timeline.",
    estimatedMinutes: 7,
    publishedAt: "2026-08-28",
    sections: [
      {
        kind: "paragraph",
        text: "A memory image (RAM dump) captures process state, network connections, and often decrypted secrets that never touch disk -- which is exactly why it's valuable evidence, and why it needs a structured approach rather than opening it in a hex editor and scrolling.",
      },
      { kind: "heading", text: "Identify the OS and build before anything else" },
      {
        kind: "paragraph",
        text: "Memory-forensics tools like Volatility need to know the exact kernel/OS build to correctly interpret internal data structures -- getting this wrong produces garbage output that looks plausible but is not, which is worse than an obvious failure. Most tooling has a profile-detection step; run it first and confirm the result before trusting any later analysis.",
      },
      { kind: "heading", text: "A reasonable first-pass checklist" },
      {
        kind: "list",
        items: [
          "Process list and process tree -- what was running, and what spawned what. A process with no obviously matching parent, or a common process name running from an unusual path, is worth a second look.",
          "Network connections at capture time -- active and recently-closed sockets, which processes owned them.",
          "Loaded modules/DLLs per process -- an injected or unusually-named module in an otherwise ordinary process is a classic sign of process injection.",
          "Command-line arguments per process -- often reveals exactly what a suspicious process was doing, not just that it existed.",
        ],
      },
      { kind: "callout", tone: "info", text: "Always work from a copy of the original image, and record the hash of the file you're analyzing -- if this analysis ever needs to support a real decision (a disclosure, an incident report), being able to prove you analyzed an unmodified copy matters." },
    ],
  },
  {
    id: "art-network-protocol-analysis",
    slug: "reading-a-packet-capture-with-intent",
    categoryId: "network",
    title: "Reading a packet capture with intent, not just scrolling",
    summary: "A large pcap is unreadable line-by-line. Here's how to go from 'I have a capture' to 'I understand what happened' quickly.",
    estimatedMinutes: 6,
    publishedAt: "2026-08-29",
    sections: [
      {
        kind: "paragraph",
        text: "Wireshark's default view of a busy capture is not meant to be read top to bottom -- it's meant to be filtered. The skill is knowing which filters get you from thousands of packets to the handful that answer your actual question.",
      },
      { kind: "heading", text: "Start with conversations, not packets" },
      {
        kind: "paragraph",
        text: "Wireshark's Statistics > Conversations view (or `tshark -q -z conn,tcp`) summarizes every distinct connection by endpoint, byte count, and duration before you look at a single packet. This tells you immediately which conversation is worth focusing on -- the largest transfer, the longest-lived connection, or the one to an unexpected destination.",
      },
      {
        kind: "code",
        language: "text",
        code: "# Isolate one TCP conversation once you've identified it\ntcp.stream eq 4\n\n# Follow just the HTTP requests/responses in that stream\nhttp and tcp.stream eq 4\n\n# Find any cleartext credentials or tokens (a real, common finding)\nhttp.request.method == \"POST\" or tls.handshake.type == 1",
      },
      { kind: "heading", text: "Decrypting TLS when you have the key" },
      {
        kind: "paragraph",
        text: "If you legitimately have the session keys (e.g. via an `SSLKEYLOGFILE` from a browser you control, for testing your own traffic), Wireshark can decrypt TLS in place and show you the actual application data -- essential for testing your own client/server interaction, and completely different from trying to break TLS on traffic you don't have the keys for, which this technique does not help with at all.",
      },
    ],
  },
  {
    id: "art-crypto-hashing-vs-encryption",
    slug: "hashing-vs-encryption-common-confusions",
    categoryId: "crypto",
    title: "Hashing vs. encryption: the confusion that causes real bugs",
    summary: "A surprising number of real findings come from an application treating a hash as if it were encryption, or vice versa.",
    estimatedMinutes: 5,
    publishedAt: "2026-08-30",
    sections: [
      {
        kind: "paragraph",
        text: "Hashing is one-way and encryption is two-way (given the key) -- a small distinction with large consequences when a developer picks the wrong one for the job.",
      },
      { kind: "heading", text: "The password-reset-token anti-pattern" },
      {
        kind: "paragraph",
        text: 'A password reset token is often just a hash of the user\'s email plus a timestamp -- which means anyone who knows (or can guess) the email and roughly when the reset was requested can recompute the exact same token. Hashing something predictable does not make it secret; it just makes it look unreadable at a glance. The fix an application actually needs is a cryptographically random token, generated server-side and stored, not derived from guessable inputs.',
      },
      { kind: "heading", text: "\"Encrypted\" fields that are actually just hashed" },
      {
        kind: "paragraph",
        text: "Conversely, watch for a field described as encrypted that is actually only hashed -- if the application ever needs to recover the original value (to display a masked version, to re-verify against a third party), a one-way hash cannot do that, which sometimes leads to a second, parallel storage of the plaintext elsewhere in the system as a workaround -- itself worth investigating as a separate exposure.",
      },
      { kind: "callout", tone: "info", text: "When you find password or token handling that seems off, the first useful question is simply: is this value ever compared for equality (suggesting a hash), or ever decrypted back to something else (suggesting real encryption)? The answer usually reveals which mechanism was intended and where it diverges from correct use." },
    ],
  },
  {
    id: "art-web-ssrf-fundamentals",
    slug: "server-side-request-forgery-fundamentals",
    categoryId: "web",
    title: "Server-side request forgery: fundamentals and real impact",
    summary: "SSRF findings range from a minor information leak to full internal-network access -- knowing which is which changes how you report it.",
    estimatedMinutes: 8,
    publishedAt: "2026-08-31",
    sections: [
      {
        kind: "paragraph",
        text: "Server-side request forgery happens when an application fetches a URL you control on your behalf, server-side -- an image-import feature, a webhook validator, a PDF generator that renders a remote page. The server, not your browser, makes the request, which means it can reach places your browser never could: internal-only services, cloud metadata endpoints, and localhost.",
      },
      { kind: "heading", text: "Why SSRF severity varies so much" },
      {
        kind: "list",
        items: [
          "Blind SSRF (you can trigger the request but never see the response) is real but limited -- typically useful for port-scanning an internal network or triggering a side effect, reported with lower severity than one where you can read the response.",
          "SSRF that returns the response to you is much more severe -- reaching a cloud provider's metadata endpoint (a well-known internal address most cloud platforms expose) can return temporary credentials for the instance's own IAM role, which is a direct path to broader compromise, not just an information leak.",
          "SSRF that reaches an internal admin panel, an unauthenticated internal API, or a database's HTTP interface can be a full compromise on its own, independent of any credential leak.",
        ],
      },
      { kind: "heading", text: "Bypassing naive filters" },
      {
        kind: "paragraph",
        text: 'A common, incomplete defense blocks the literal string "localhost" or "127.0.0.1" but not equivalent representations: decimal IP notation (`2130706433`), IPv6 loopback (`::1`), a DNS name that resolves to an internal address, or a redirect chain that starts at an allowed URL and 302s to a disallowed one. Testing whether a filter is checking the final resolved destination or just the literal input string is usually the fastest way to find a bypass.',
      },
      { kind: "callout", tone: "warning", text: "Test SSRF against infrastructure you understand the blast radius of -- an internal service you reach unexpectedly may not be designed to handle unexpected external traffic gracefully." },
    ],
  },
];

export function listTrainingArticlesByCategory(categoryId: CtfCategoryId): TrainingArticle[] {
  return TRAINING_ARTICLES.filter((article) => article.categoryId === categoryId);
}

export function getTrainingArticleBySlug(slug: string): TrainingArticle | undefined {
  return TRAINING_ARTICLES.find((article) => article.slug === slug);
}
