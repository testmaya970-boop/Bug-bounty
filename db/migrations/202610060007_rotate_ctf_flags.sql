-- P0 (2026-10-06 audit): every CTF flag was recoverable without solving -- the plaintext
-- table sat in the repo (scripts/ctf-artifacts/lib.mjs, e2e/ctf.spec.ts) and 12 challenges'
-- published material printed the flag outright, shipped in the client bundle.
--
-- Flags are now derived from the CTF_FLAG_SECRET env secret (lib/ctf-flags.ts:
-- unpatched{<base>_<HMAC suffix>}); the repo holds only these hashes. Every old flag stops
-- working. The 12 retired challenges (RETIRED_CTF_CHALLENGE_IDS in lib/mock/ctf.ts) get the
-- hash of discarded random bytes, so nothing can solve them. Existing solves and event
-- history are untouched.
update public.ctf_challenges c
set flag_hash = v.flag_hash
from (values
  ('c-web-1', '50ff4ed8f719e054d26bdbdfd3e3e2e1834b23b2bdd56380a56d537319d59b69'),
  ('c-web-2', '5ab1d255a48604cbbef9377617fc2ef96dd4560eeb99db227df1a7bd2648d8a3'),
  ('c-web-3', '6c182a37b0e8aa723950cafb1d80af2d357077d6de42a1950247b0c23796ad6f'),
  ('c-web-4', '5acbbf68eb53491bec8b8e90f53a6b6352953213cfd0f02d157ede3a6a314c18'),
  ('c-web-5', '9b6c11196e689cdddaa6cf551644d354eda8a0cfefcd49fa8de666178551de51'),
  ('c-web-6', '23844449a6d496e3c598f7e0219dfd7665ce8f58673c2701ba7a090edcd3dd5c'),
  ('c-web-7', '2676f438f1fd17f1e8159751ba4dae8c9e606fe9b59e8fcdcc26cbcfc01a3887'),
  ('c-crypto-1', 'a700e6ca22ac11980dc06844397bc54602a469e8bd8eb2695b30a5723b99562a'),
  ('c-crypto-2', '03343d9ca4ce41b9dfbb57ac8e748c97ac86074e852daf98e9440a6a4e283d7b'),
  ('c-crypto-3', 'd410db117d71bb1b92f6c45a3356480a9c0dce4af3995b76ea4ab5daf45803ce'),
  ('c-crypto-4', 'ea7bbffc04e91fedd2cb34818ca1a69732a0de74c04a428d5464a5e8e7b38367'),
  ('c-crypto-5', 'bae1a24dc19dfb1dd7c88763adfb02b04a5ae8a47841edfeaa5989d3fd16e31e'),
  ('c-crypto-6', '3346bcddc10cead18167544c692ee10934b91b851732cbb7d04206ee22a8e5d5'),
  ('c-re-1', 'cb0946d2d39cd1d967aa25412fbe9474b1ebb06e0fb939b075f0c35e97085bb0'),
  ('c-re-2', '0c359557935e7ea3fa37b7b9b500fa539c73be7722537cc11b0c522aa8555df1'),
  ('c-re-3', '83c6095d881b9fdd7e8957f0e8481ca39c2699ef53b86055ff87078fac321666'),
  ('c-re-4', '95fe2cffc70d774d9eb1235ce40f99f25a297fad70ec8fba33830b9cb474947c'),
  ('c-re-5', 'f76eef53bc19051dbecf42f47291833e2fba7dabfa235a59cec5df461f53f6b8'),
  ('c-pwn-1', '06f07b1ce07460c0e3afa23e98b0985d1f6634e9f1668f874ad87da5c8558c88'),
  ('c-pwn-2', '6c7c31254a8418eb4543efd1e1307357ec51f69140c308636e4588072fa2cf78'),
  ('c-pwn-3', 'bb4f2df75b7865d3c6428d1b0e8f391e5ff3f4b40d2a88075c7e43cdd305e5e6'),
  ('c-pwn-4', 'c18a082be19ec8d4673a4fe53ae6c3f9319fbda601ae677885ee4809df7c5cb2'),
  ('c-forensics-1', '3e369efb6dbf555dca60c2058c8d4fdfbc9f6b5bae25da3e74794b7dee77ef41'),
  ('c-forensics-2', '2318b6433f025155a2757b542dfa86692bfe3467776df051784f281ed135cc3c'),
  ('c-forensics-3', '38addc5c33c4e20d55f1c6648f8ebca3d3426c2db137d3deb60908a139f0c9ff'),
  ('c-network-1', 'b443f0f8ad997903b38101dfb3277e7d929ab1c507adb0f211b7dc539f805f9a'),
  ('c-network-2', '92f0a4759de0ee08668ad202d88cc0eddc5ff011c2ba66951cc29a3f2924708f'),
  ('c-network-3', 'd13b9e1d8aa3d453a88eab0d4467b45d1745b00cf7c4f0550b5d58b8b1b5d1b9')
) as v(id, flag_hash)
where c.id = v.id;
