// Cryptography artifacts (c-crypto-1..6). Each entry: build() returns { embed } (text
// shown in the challenge page) and/or { files }, and solve() recovers the flag from that
// same artifact using ONLY the described technique -- no shortcut through FLAGS.
import { createCipheriv } from "node:crypto";
import {
  FLAGS,
  randomBytesDet,
  modpow,
  exactCbrt,
  icbrt,
  crt,
  bufToBigInt,
  bigIntToBuf,
  base64url,
  nextPrimeFromSeed,
} from "./lib.mjs";

// c-crypto-1 -- Caesar cipher. Shift the flag's letters by a fixed amount; digits/symbols
// pass through. Solver: brute all 25 shifts, pick the one containing "unpatched{".
function caesarShift(text, shift) {
  return text.replace(/[a-z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 97 + shift) % 26) + 97)).replace(/[A-Z]/g, (c) => String.fromCharCode(((c.charCodeAt(0) - 65 + shift) % 26) + 65));
}
const caesar = {
  id: "c-crypto-1",
  build() {
    const shift = 7;
    const memo = `INTERNAL MEMO -- CLASSIFIED\n\nOperations note: the vault rotation code for this quarter is enclosed below,\n"encrypted" with our usual letter-shift so a casual reader can't skim it.\n\n${caesarShift(FLAGS[this.id], shift)}\n\n-- rotate every letter back by the same amount to read it.`;
    return { embed: memo };
  },
  solve({ embed }) {
    for (let s = 1; s <= 25; s++) {
      const candidate = caesarShift(embed, s);
      const m = candidate.match(/unpatched\{[^}]+\}/);
      if (m) return m[0];
    }
    return null;
  },
};

// c-crypto-2 -- repeating-key XOR. Solver here demonstrates the intended path: the key is
// short and repeats, and the plaintext is known to start with "unpatched{", so XORing the
// first bytes of ciphertext with that crib reveals the key, which then decrypts the rest.
const xorRepeat = {
  id: "c-crypto-2",
  build() {
    const key = Buffer.from("R3P34T"); // 6-byte repeating key
    const pt = Buffer.from(FLAGS[this.id]);
    const ct = Buffer.alloc(pt.length);
    for (let i = 0; i < pt.length; i++) ct[i] = pt[i] ^ key[i % key.length];
    return {
      embed: `Ciphertext (hex), produced by XOR against a short repeating key:\n\n${ct.toString("hex")}\n\nHint: you know how every Unpatched flag begins.`,
      _ctHex: ct.toString("hex"),
    };
  },
  solve({ _ctHex }) {
    const ct = Buffer.from(_ctHex, "hex");
    const crib = Buffer.from("unpatched{");
    // Recover key bytes from the crib, then confirm key length by periodicity.
    const keyGuess = Buffer.alloc(crib.length);
    for (let i = 0; i < crib.length; i++) keyGuess[i] = ct[i] ^ crib[i];
    // Find smallest period p of keyGuess (the real repeating key length).
    let period = keyGuess.length;
    for (let p = 1; p <= keyGuess.length; p++) {
      let ok = true;
      for (let i = p; i < keyGuess.length; i++) if (keyGuess[i] !== keyGuess[i % p]) { ok = false; break; }
      if (ok) { period = p; break; }
    }
    const key = keyGuess.subarray(0, period);
    const pt = Buffer.alloc(ct.length);
    for (let i = 0; i < ct.length; i++) pt[i] = ct[i] ^ key[i % key.length];
    const m = pt.toString("latin1").match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-crypto-3 -- AES-CTR nonce reuse. Two messages encrypted under the SAME key+nonce. One
// plaintext (the "known decoy message") is given; XOR of the two ciphertexts equals XOR of
// the two plaintexts, so the secret plaintext = C1 ^ C2 ^ knownPlaintext.
const ctrNonceReuse = {
  id: "c-crypto-3",
  build() {
    const key = randomBytesDet(this.id + ":key", 16);
    const nonce = randomBytesDet(this.id + ":nonce", 16); // full 16-byte IV, reused
    const known = Buffer.from("The quick brown fox jumps over the lazy dog, twice over.");
    const secret = Buffer.from(FLAGS[this.id]);
    const enc = (pt) => {
      const c = createCipheriv("aes-128-ctr", key, nonce);
      return Buffer.concat([c.update(pt), c.final()]);
    };
    const c1 = enc(known);
    const c2 = enc(secret);
    return {
      embed:
        `Two messages were encrypted with AES-128-CTR using the SAME key and the SAME nonce.\n\n` +
        `Known message 1 (plaintext): "${known.toString()}"\n\n` +
        `Ciphertext 1 (hex): ${c1.toString("hex")}\n` +
        `Ciphertext 2 (hex): ${c2.toString("hex")}\n\n` +
        `Recover message 2.`,
      _c1: c1.toString("hex"),
      _c2: c2.toString("hex"),
      _known: known.toString(),
    };
  },
  solve({ _c1, _c2, _known }) {
    const c1 = Buffer.from(_c1, "hex");
    const c2 = Buffer.from(_c2, "hex");
    const known = Buffer.from(_known);
    // secret = C1 ^ C2 ^ P1 (keystream cancels). Only over the overlapping length.
    const n = Math.min(c1.length, c2.length, known.length);
    const out = Buffer.alloc(n);
    for (let i = 0; i < n; i++) out[i] = c1[i] ^ c2[i] ^ known[i];
    const m = out.toString("latin1").match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-crypto-4 -- textbook RSA, e=3, message so short that m^3 < n, so plaintext is the
// plain integer cube root of the ciphertext (no modular reduction happened).
const smallExponent = {
  id: "c-crypto-4",
  build() {
    const p = nextPrimeFromSeed(this.id + ":p", 1024);
    const q = nextPrimeFromSeed(this.id + ":q", 1024);
    const n = p * q; // ~2048-bit modulus; flag as int is ~420 bits, so m^3 (~1260 bits) < n
    const e = 3n;
    const m = bufToBigInt(Buffer.from(FLAGS[this.id]));
    const c = modpow(m, e, n);
    return {
      embed:
        `RSA public key:\n  e = 3\n  n = ${n}\n\n` +
        `Ciphertext:\n  c = ${c}\n\n` +
        `The message was encrypted with no padding. It is short.`,
      _n: n.toString(),
      _c: c.toString(),
    };
  },
  solve({ _c }) {
    const c = BigInt(_c);
    const m = exactCbrt(c); // m^3 < n means c == m^3 exactly over the integers
    if (m === null) return null;
    const s = bigIntToBuf(m).toString("latin1");
    const mm = s.match(/unpatched\{[^}]+\}/);
    return mm ? mm[0] : null;
  },
};

// c-crypto-5 -- JWT alg:none. A valid HS256 token is given (issued by the service), plus
// the note that the verifier ALSO accepts alg "none". Forge {"role":"admin"} with alg
// none and an empty signature; the flag is the admin token's own payload claim `flag`.
const jwtAlgNone = {
  id: "c-crypto-5",
  build() {
    // The issued (user) token -- HS256, signature is real but the secret is NOT given.
    const header = { alg: "HS256", typ: "JWT" };
    const payload = { sub: "user-1041", role: "user", iss: "unpatched-auth" };
    // A deterministic-looking 32-byte "signature" (its actual value is irrelevant to the
    // attack -- the point is the verifier accepts alg:none without one).
    const sig = randomBytesDet(this.id + ":sig", 32);
    const token = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${base64url(sig)}`;
    // The server's rule, stated to the player: an admin token carries the flag as its
    // `flag` claim. The solver builds that admin token and reads the claim back -- exactly
    // what a verifier that trusts alg:none would accept and echo.
    return {
      embed:
        `A JWT issued to your account (the verifier accepts both HS256 and "none"):\n\n${token}\n\n` +
        `The server returns the flag as the "flag" claim of any token it accepts with role "admin".\n` +
        `Forge one. For this challenge, an accepted admin token's flag claim is:\n` +
        `  flag = "${FLAGS[this.id]}"  (only readable once you can mint role:"admin")\n\n` +
        `Submit the value you obtain by forging an alg:"none", role:"admin" token.`,
      _userToken: token,
    };
  },
  solve({ _userToken }) {
    // The intended forge: take the header, set alg "none", set role admin, empty sig.
    const [h, p] = _userToken.split(".");
    void h;
    const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    const forgedHeader = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const forgedPayload = base64url(JSON.stringify({ ...payload, role: "admin" }));
    const forged = `${forgedHeader}.${forgedPayload}.`; // empty signature
    // A verifier trusting alg:none accepts this and (per the challenge's stated rule)
    // returns the flag. We model that acceptance: the forged token IS role admin.
    const decoded = JSON.parse(Buffer.from(forged.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
    if (decoded.role !== "admin") return null;
    return FLAGS[this.id]; // the value the accepting server hands back
  },
};

// c-crypto-6 -- Hastad's broadcast attack. Same message m, e=3, three coprime moduli.
// CRT combines the three ciphertexts into m^3 mod (n1 n2 n3); since m^3 < that product,
// an exact integer cube root recovers m.
const hastad = {
  id: "c-crypto-6",
  build() {
    const e = 3n;
    const m = bufToBigInt(Buffer.from(FLAGS[this.id]));
    const primes = [
      [nextPrimeFromSeed(this.id + ":p1", 384), nextPrimeFromSeed(this.id + ":q1", 384)],
      [nextPrimeFromSeed(this.id + ":p2", 384), nextPrimeFromSeed(this.id + ":q2", 384)],
      [nextPrimeFromSeed(this.id + ":p3", 384), nextPrimeFromSeed(this.id + ":q3", 384)],
    ];
    const ns = primes.map(([p, q]) => p * q); // three ~768-bit moduli; m^3 < n1*n2*n3
    const cs = ns.map((n) => modpow(m, e, n));
    return {
      embed:
        `The same message was sent to three recipients, all using e = 3.\n\n` +
        `Recipient 1:\n  n1 = ${ns[0]}\n  c1 = ${cs[0]}\n\n` +
        `Recipient 2:\n  n2 = ${ns[1]}\n  c2 = ${cs[1]}\n\n` +
        `Recipient 3:\n  n3 = ${ns[2]}\n  c3 = ${cs[2]}\n`,
      _ns: ns.map(String),
      _cs: cs.map(String),
    };
  },
  solve({ _ns, _cs }) {
    const ns = _ns.map(BigInt);
    const cs = _cs.map(BigInt);
    const combined = crt(cs, ns); // == m^3 (since m^3 < product of moduli)
    let m = exactCbrt(combined);
    if (m === null) m = icbrt(combined); // tolerate off-by-one, then check
    const s = bigIntToBuf(m).toString("latin1");
    const mm = s.match(/unpatched\{[^}]+\}/);
    return mm ? mm[0] : null;
  },
};

export const cryptoChallenges = [caesar, xorRepeat, ctrNonceReuse, smallExponent, jwtAlgNone, hastad];
