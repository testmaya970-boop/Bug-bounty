// Shared helpers for the CTF artifact generators (scripts/ctf-artifacts/*).
// Pure Node stdlib -- no new dependency. Each generator builds a challenge's static
// artifact AND exposes a solver that re-derives the flag from that same artifact, so
// `npm run ctf:artifacts -- --verify` proves every one of the 28 flags is genuinely
// derivable (and matches db/migrations/...ctf... 's hashed plaintext) before anything ships.
import { createHash } from "node:crypto";

// The 28 plaintext flags, id -> flag. This is the ONE place outside the migration the
// plaintext appears, and only so the generator can (a) embed the RIGHT bytes and (b)
// assert its own solver recovers exactly this. It is a build-time script, never shipped to
// a client and never imported by app code (lib/mock/ctf.ts still has no `flag` field).
export const FLAGS = {
  "c-web-1": "unpatched{c00k1e_tru5t_1ssue}",
  "c-web-2": "unpatched{r3fl3ct3d_xss_101}",
  "c-web-3": "unpatched{1d0r_invo1c3_l3ak}",
  "c-web-4": "unpatched{csrf_n0_t0k3n_n0_pr0bl3m}",
  "c-web-5": "unpatched{ssrf_m3tadata_r3ach}",
  "c-web-6": "unpatched{lo0se_c0mpar3_magic_hash}",
  "c-web-7": "unpatched{ssti_rc3_ach13v3d}",
  "c-crypto-1": "unpatched{caesar_was_n0_cryptographer}",
  "c-crypto-2": "unpatched{x0r_k3y_r3us3_1s_fatal}",
  "c-crypto-3": "unpatched{n0nce_reuse_breaks_ctr}",
  "c-crypto-4": "unpatched{cub3_r00t_rsa_n0_padding}",
  "c-crypto-5": "unpatched{alg_none_is_never_none}",
  "c-crypto-6": "unpatched{hastad_broadcast_attack}",
  "c-re-1": "unpatched{str1ngs_and_a_d1sassembler}",
  "c-re-2": "unpatched{junk_c0de_hid3s_n0thing}",
  "c-re-3": "unpatched{unpack3d_and_und3rst00d}",
  "c-re-4": "unpatched{custom_vm_bytec0de_solv3d}",
  "c-re-5": "unpatched{d3bugg3r_d3t3ct3d_and_d3f3at3d}",
  "c-pwn-1": "unpatched{cl4ssic_st4ck_0v3rfl0w}",
  "c-pwn-2": "unpatched{r0p_ch41n_c0mpl3t3}",
  "c-pwn-3": "unpatched{uaf_dangling_p0int3r_pwn}",
  "c-pwn-4": "unpatched{printf_leaks_the_stack}",
  "c-forensics-1": "unpatched{app3nd3d_data_aft3r_e0i}",
  "c-forensics-2": "unpatched{f1l3_carving_r3c0v3ry}",
  "c-forensics-3": "unpatched{plaintext_liv3s_in_ram}",
  "c-network-1": "unpatched{pl41ntext_cr3ds_1n_pcap}",
  "c-network-2": "unpatched{dns_tunn3l_data_ex0}",
  "c-network-3": "unpatched{v3rsi0n_d0wngrad3_attack}",
};

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
