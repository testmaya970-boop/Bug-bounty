// Shared helpers for the CTF artifact generators (scripts/ctf-artifacts/*).
// Pure Node stdlib -- no new dependency. Each generator builds a challenge's static
// artifact AND exposes a solver that re-derives the flag from that same artifact, so
// `npm run ctf:artifacts:verify` proves every live flag is genuinely
// derivable (and matches db/migrations/...ctf... 's hashed plaintext) before anything ships.
import { createHash } from "node:crypto";

// Flags are derived from CTF_FLAG_SECRET (lib/ctf-flags.ts), never written down: the repo
// holds only readable bases and the flag hashes. Retired challenges (RETIRED_CTF_CHALLENGE_IDS,
// whose material revealed the flag) get no flag and no artifacts. Run via tsx with the env
// loaded -- see the ctf:artifacts scripts in package.json.
import { ctfFlag, CTF_FLAG_BASES } from "../../lib/ctf-flags.ts";
import { RETIRED_CTF_CHALLENGE_IDS } from "../../lib/mock/ctf.ts";

export const FLAGS = Object.fromEntries(
  Object.keys(CTF_FLAG_BASES).filter((id) => !RETIRED_CTF_CHALLENGE_IDS.has(id)).map((id) => [id, ctfFlag(id)]),
);

export function sha256hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

// A tiny deterministic PRNG (mulberry32) so every regenerated artifact is byte-identical
// run to run -- a CTF artifact that changed each build would make the seeded flag_hash and
// any committed file drift. Seeded per-challenge by challenge id.
export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBytesDet(seedStr, n) {
  const r = rng(seedStr);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(r() * 256);
  return out;
}

export function xorBuffers(a, b) {
  const out = Buffer.alloc(Math.min(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = a[i] ^ b[i];
  return out;
}

// --- bigint modular arithmetic for the RSA challenges (no bignum dependency needed) ---
export function modpow(base, exp, mod) {
  base %= mod;
  let result = 1n;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

// Integer cube root (floor) via binary search -- used by the e=3 RSA solvers.
export function icbrt(n) {
  if (n < 0n) throw new Error("icbrt: negative");
  if (n < 2n) return n;
  let lo = 0n;
  let hi = 1n << (BigInt(n.toString(2).length) / 3n + 2n);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid * mid * mid <= n) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

// Exact integer cube root, or null if n is not a perfect cube.
export function exactCbrt(n) {
  const r = icbrt(n);
  if (r * r * r === n) return r;
  if ((r + 1n) ** 3n === n) return r + 1n;
  return null;
}

export function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

export function modinv(a, m) {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1n) throw new Error("modinv: not invertible");
  return ((x % m) + m) % m;
}

// Chinese Remainder Theorem over pairwise-coprime moduli.
export function crt(residues, moduli) {
  let M = 1n;
  for (const m of moduli) M *= m;
  let x = 0n;
  for (let i = 0; i < moduli.length; i++) {
    const Mi = M / moduli[i];
    x += residues[i] * Mi * modinv(Mi, moduli[i]);
  }
  return ((x % M) + M) % M;
}

export function bufToBigInt(buf) {
  let x = 0n;
  for (const b of buf) x = (x << 8n) | BigInt(b);
  return x;
}

export function bigIntToBuf(x) {
  if (x === 0n) return Buffer.from([0]);
  const bytes = [];
  while (x > 0n) {
    bytes.unshift(Number(x & 0xffn));
    x >>= 8n;
  }
  return Buffer.from(bytes);
}

export function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// A small, deterministic "random-looking" 256-bit prime near a seed, for the RSA
// challenges. Miller-Rabin with fixed small witnesses (deterministic enough for these
// sizes and for a CTF artifact -- these are not real keys).
function isProbablePrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    if (n % p === 0n) return n === p;
  }
  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    r++;
  }
  for (const a of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
    let x = modpow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let composite = true;
    for (let i = 0n; i < r - 1n; i++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        composite = false;
        break;
      }
    }
    if (composite) return false;
  }
  return true;
}

export function nextPrimeFromSeed(seedStr, bits) {
  const buf = randomBytesDet(seedStr, bits / 8);
  let n = bufToBigInt(buf) | (1n << BigInt(bits - 1)) | 1n; // set top+bottom bit
  while (!isProbablePrime(n)) n += 2n;
  return n;
}
