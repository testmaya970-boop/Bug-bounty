import { createHmac } from "node:crypto";

/**
 * CTF flags are derived, never stored: `unpatched{<base>_<16 hex of HMAC(secret, id)>}`.
 * The readable base keeps the flavor; the 64-bit suffix means neither the repo (which holds
 * only these bases and the flag hashes) nor a hash can be turned back into a flag.
 *
 * Every environment must use the same CTF_FLAG_SECRET: the downloadable artifacts in
 * public/ctf-artifacts/ and the hashes in the CTF migrations were generated with it.
 * Used by scripts/ctf-artifacts at build time and by the E2E suite -- never by app code.
 */
export const CTF_FLAG_BASES: Record<string, string> = {
  "c-web-1": "c00k1e_tru5t_1ssue",
  "c-web-2": "r3fl3ct3d_xss",
  "c-web-3": "1d0r_invo1c3_l3ak",
  "c-web-4": "csrf_n0_t0k3n",
  "c-web-5": "ssrf_m3tadata_r3ach",
  "c-web-6": "lo0se_c0mpar3_magic_hash",
  "c-web-7": "ssti_rc3_ach13v3d",
  "c-crypto-1": "caesar_was_n0_cryptographer",
  "c-crypto-2": "x0r_k3y_r3us3_1s_fatal",
  "c-crypto-3": "n0nce_reuse_breaks_ctr",
  "c-crypto-4": "cub3_r00t_rsa_n0_padding",
  "c-crypto-5": "alg_none_is_never_none",
  "c-crypto-6": "hastad_broadcast_attack",
  "c-re-1": "str1ngs_and_a_d1sassembler",
  "c-re-2": "junk_c0de_hid3s_n0thing",
  "c-re-3": "unpack3d_and_und3rst00d",
  "c-re-4": "custom_vm_bytec0de_solv3d",
  "c-re-5": "d3bugg3r_d3t3ct3d",
  "c-pwn-1": "cl4ssic_st4ck_0v3rfl0w",
  "c-pwn-2": "r0p_ch41n_c0mpl3t3",
  "c-pwn-3": "uaf_dangling_p0int3r",
  "c-pwn-4": "printf_leaks_the_stack",
  "c-forensics-1": "app3nd3d_data_aft3r_e0i",
  "c-forensics-2": "f1l3_carving_r3c0v3ry",
  "c-forensics-3": "plaintext_liv3s_in_ram",
  "c-network-1": "pl41ntext_cr3ds_1n_pcap",
  "c-network-2": "dns_tunn3l_data_ex0",
  "c-network-3": "v3rsi0n_d0wngrad3",
};

function flagSecret(): string {
  const secret = process.env.CTF_FLAG_SECRET;
  if (!secret || secret.length < 32) throw new Error("CTF_FLAG_SECRET is not set (or shorter than 32 characters)");
  return secret;
}

export function ctfFlag(challengeId: string): string {
  const base = CTF_FLAG_BASES[challengeId];
  if (!base) throw new Error(`unknown CTF challenge ${challengeId}`);
  const suffix = createHmac("sha256", flagSecret()).update(challengeId).digest("hex").slice(0, 16);
  return `unpatched{${base}_${suffix}}`;
}
