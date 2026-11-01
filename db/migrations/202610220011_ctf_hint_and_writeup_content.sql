-- Hint text and official write-ups for every live CTF challenge (tables from 202610220010).
-- Hint costs scale with difficulty and never add up to the challenge's full points:
-- Easy 100 (10/20/30), Medium 250 (25/50/75), Hard 500 (50/100/150), Insane 1000 (100/200/300).
-- Neither hints nor write-ups contain a flag: every flag carries a secret-derived suffix.

insert into public.ctf_hints (challenge_id, position, cost, body) values
  ('c-crypto-1', 1, 10, 'Only letters moved. Digits, braces and underscores are untouched, so the shape of the flag is already visible.'),
  ('c-crypto-1', 2, 20, 'There are only 25 possible shifts. Try them all and look for the word every flag starts with.'),
  ('c-crypto-1', 3, 30, 'Line up the first word of the ciphertext against "unpatched": the distance from u to the first letter is the shift.'),

  ('c-crypto-2', 1, 25, 'XOR is its own inverse: ciphertext XOR plaintext gives the key.'),
  ('c-crypto-2', 2, 50, 'You already know the first ten bytes of the plaintext. XOR them with the first ten ciphertext bytes and look for a repeating pattern.'),

  ('c-crypto-3', 1, 25, 'CTR mode turns AES into a stream cipher. With the same key and nonce, both messages were XORed with the same keystream.'),
  ('c-crypto-3', 2, 50, 'C1 XOR C2 equals P1 XOR P2. You know P1, so one more XOR recovers P2 for as many bytes as both messages share.'),

  ('c-crypto-4', 1, 50, 'Compare the size of c with the size of n. Is c anywhere close to wrapping around the modulus?'),
  ('c-crypto-4', 2, 100, 'If m cubed is smaller than n, the modular reduction never happened and c is simply m cubed.'),
  ('c-crypto-4', 3, 150, 'Take an exact integer cube root of c (Newton''s method or a big-integer library, not floating point), then convert the integer to bytes.'),

  ('c-crypto-6', 1, 100, 'One recipient alone is safe enough. The weakness is the same message going to three moduli with the same small exponent.'),
  ('c-crypto-6', 2, 200, 'The Chinese Remainder Theorem combines c1, c2 and c3 into a single value congruent to m cubed modulo n1 n2 n3.'),
  ('c-crypto-6', 3, 300, 'm cubed is smaller than the product of the three moduli, so the combined value is exactly m cubed. Take the integer cube root.'),

  ('c-re-1', 1, 10, 'The listing builds the expected key one byte at a time before the comparison.'),
  ('c-re-1', 2, 20, 'Each mov byte instruction stores one ASCII character as a hex immediate. Read them in stack order.'),
  ('c-re-1', 3, 30, 'Convert each immediate to its character and stop at the terminating zero byte.'),

  ('c-re-2', 1, 25, 'Trace which instructions actually change the key buffer. Most of the function is noise.'),
  ('c-re-2', 2, 50, 'add then sub of the same value, xor of a register with itself and multiply by one all net to nothing. Drop them and read the stores that remain.'),

  ('c-re-3', 1, 25, 'The stub that runs before main decodes the packed section in place. Find what it XORs each byte with.'),
  ('c-re-3', 2, 50, 'It is a single-byte key loaded into al. Apply the same XOR to every byte of the hex dump yourself.'),

  ('c-re-4', 1, 50, 'Start with the opcode table. Every byte of the program is either an opcode or an operand of the opcode before it.'),
  ('c-re-4', 2, 100, 'Only three instructions exist. PUSH takes one immediate byte, OUT pops and emits, HALT stops.'),
  ('c-re-4', 3, 150, 'Write a ten-line interpreter, or simply read every byte that follows a PUSH and turn it into ASCII.'),

  ('c-re-5', 1, 100, 'There are two separate checks: a debugger-presence call and a timing check. Each one routes execution to a different path.'),
  ('c-re-5', 2, 200, 'When a debugger is detected, the code jumps to a decoy path that writes corrupted bytes. Ignore that branch completely.'),
  ('c-re-5', 3, 300, 'Follow the clean label only and rebuild the key from its mov immediates, exactly like a plain license check.'),

  ('c-pwn-4', 1, 25, 'printf with user input as the format string will happily read arguments that were never passed. They come straight off the stack.'),
  ('c-pwn-4', 2, 50, 'Each leaked word is eight bytes, printed little-endian. Reverse the byte order of every word before reading it as ASCII.'),

  ('c-forensics-1', 1, 10, 'A JPEG ends at a fixed marker. Anything after it is ignored by image viewers but still on disk.'),
  ('c-forensics-1', 2, 20, 'Look for the end-of-image marker FF D9 in a hex viewer.'),
  ('c-forensics-1', 3, 30, 'Read the bytes that follow the last FF D9 as text.'),

  ('c-forensics-2', 1, 25, 'There is no filesystem index left to help you. Search the raw bytes for a known file signature instead.'),
  ('c-forensics-2', 2, 50, 'The recovered file is a PNG (signature 89 50 4E 47). PNG keeps text metadata in tEXt chunks.'),
  ('c-forensics-2', 3, 75, 'Carve from the PNG signature to the IEND chunk, then read the contents of its tEXt chunk.'),

  ('c-forensics-3', 1, 50, 'Most of a memory dump is binary noise. The document text sits in a readable region.'),
  ('c-forensics-3', 2, 100, 'Extract runs of printable characters, at least four long. This is what the strings tool does.'),
  ('c-forensics-3', 3, 150, 'Search the extracted strings for the flag prefix rather than reading them all.'),

  ('c-network-1', 1, 10, 'The login happened over plain HTTP. Filter the capture down to that traffic.'),
  ('c-network-1', 2, 20, 'Find the POST request that submits the login form and follow its TCP stream.'),
  ('c-network-1', 3, 30, 'The form body is URL-encoded. The password field holds what you need.'),

  ('c-network-2', 1, 25, 'Look at the query names themselves, not the answers. The subdomain labels under one domain are not random hostnames.'),
  ('c-network-2', 2, 50, 'The labels use only 0-9 and a-f. Join them in capture order and hex-decode the result.');

insert into public.ctf_official_writeups (challenge_id, body) values
  ('c-crypto-1', E'The vulnerability: a Caesar cipher shifts every letter by one fixed amount, so its whole key space is 25 values. Encryption that a loop of 25 tries breaks is encoding, not protection.\n\nSolving it: the flag format is known, so the first word must decrypt to "unpatched". The distance from u to the first ciphertext letter gives the shift (7). Shifting every letter back by 7 recovers the memo; digits and symbols were never changed.\n\nThe fix: use a vetted authenticated cipher such as AES-GCM or ChaCha20-Poly1305 with a key from a key management service. Never invent or reuse classical ciphers for real data.'),

  ('c-crypto-2', E'The vulnerability: a short key repeated across a longer message. XOR with a repeating key leaks the key wherever the plaintext is known or guessable, and every flag starts with "unpatched{".\n\nSolving it: XOR the first ten ciphertext bytes with "unpatched{". The result repeats with period 6, so the key is six bytes long. XOR the whole ciphertext with that key, repeated, to read the flag. Without a known prefix, the classic path is to estimate the key length from repeated byte patterns or Hamming distance, then solve each key byte as a single-byte XOR by frequency analysis.\n\nThe fix: never reuse keystream. Use an authenticated cipher with a unique nonce per message rather than hand-rolled XOR.'),

  ('c-crypto-3', E'The vulnerability: AES-CTR encrypts by XORing the plaintext with a keystream derived from the key and nonce. Reusing both for two messages reuses the keystream, and XORing the two ciphertexts cancels it out.\n\nSolving it: C1 XOR C2 = P1 XOR P2. The first message is given, so P2 = C1 XOR C2 XOR P1 for the overlapping length. The second message is shorter than the first, so the whole flag is recovered.\n\nThe fix: a nonce must never repeat under the same key. Generate nonces from a counter or a random source large enough to avoid collisions, and prefer AES-GCM-SIV or XChaCha20-Poly1305 when nonce management is hard.'),

  ('c-crypto-4', E'The vulnerability: textbook RSA with e = 3 and no padding. When the message is short, m cubed is smaller than the modulus, so "mod n" never takes effect and the ciphertext is just m cubed as an ordinary integer.\n\nSolving it: c is far smaller than n. Compute the exact integer cube root of c with big-integer arithmetic (Newton''s method or a binary search; floating point loses precision), then convert the integer to bytes to read the flag.\n\nThe fix: always use RSA with a randomized padding scheme, OAEP for encryption, which makes every padded message nearly as large as the modulus. Better still, use RSA only to wrap a symmetric key.'),

  ('c-crypto-6', E'The vulnerability: Hastad''s broadcast attack. The same unpadded message was encrypted to three recipients, each with e = 3 and a different modulus. Each ciphertext alone is fine; together they reveal the message.\n\nSolving it: the Chinese Remainder Theorem combines c1, c2 and c3 into one value x with x congruent to m cubed modulo n1 n2 n3. Because m is smaller than each modulus, m cubed is smaller than their product, so x equals m cubed exactly. The integer cube root of x is the message.\n\nThe fix: randomized padding (OAEP) makes each recipient''s plaintext different, which defeats the attack. A larger exponent such as 65537 helps but padding is the real fix.'),

  ('c-re-1', E'The vulnerability: the expected license key is built inside the binary and compared with strcmp. Anything a program compares against in plain form can be read back out of the program.\n\nSolving it: the disassembly stores the key one byte at a time with mov byte instructions into a stack buffer. Converting each hex immediate to ASCII, in order, until the zero terminator gives the flag. On a real binary, strings or a breakpoint on strcmp gets the same result.\n\nThe fix: never ship the secret you check against. Validate licenses with a signature (the client holds only a public key) or check them on a server you control.'),

  ('c-re-2', E'The vulnerability: obfuscation that only adds noise. Junk instructions slow a reader down but do not change what the function computes, so the real check is still in the binary.\n\nSolving it: every junk sequence nets to zero: add then sub of the same value, xor of a register with itself, multiply by one. Removing them leaves a plain run of mov byte stores into the key buffer, which read as ASCII give the flag.\n\nThe fix: obfuscation is not a security boundary. If a secret must stay secret, keep it off the client and verify on a server or with public-key signatures.'),

  ('c-re-3', E'The vulnerability: a packer that decodes itself with a key stored right next to the packed code. The program has to unpack before it runs, so the key and the routine are always shipped together.\n\nSolving it: the stub loads 0x5a into al and XORs every byte of the packed section with it. Applying the same single-byte XOR to the hex dump reproduces the unpacked bytes, and the flag reads straight out of them. On a live sample, a breakpoint just after the unpack loop shows the same plain bytes in memory.\n\nThe fix: packing hides code from casual inspection only. Do not rely on it to protect secrets or logic; keep sensitive checks server-side.'),

  ('c-re-4', E'The vulnerability: a custom bytecode VM used to hide the check. A VM adds a layer to read, but its program and its interpreter both ship in the binary, so the logic is fully recoverable.\n\nSolving it: the opcode table defines PUSH imm8 (0x01), OUT (0x02) and HALT (0xff). Walking the bytecode, each PUSH places one byte that the following OUT emits. Collecting the emitted bytes until HALT spells the flag. Writing a short interpreter is the general technique for larger VMs.\n\nThe fix: as with any client-side obfuscation, a VM only raises the cost of analysis. Secrets and decisions that matter belong on a server.'),

  ('c-re-5', E'The vulnerability: anti-debugging as protection. The binary checks IsDebuggerPresent and a timing window, and on detection silently takes a decoy path that writes corrupted key bytes.\n\nSolving it: the trick is to not trust any key built while a debugger is detected. Statically, follow only the clean label, the path taken when no debugger is present and timing is normal, and rebuild the key from its mov immediates. Dynamically, patch the conditional jumps or hook the checks so they report no debugger.\n\nThe fix: anti-debug checks delay analysis but never stop it. Keep secrets off the client and treat any client-side check as advisory.'),

  ('c-pwn-4', E'The vulnerability: printf(user_input). When user input is the format string, specifiers such as %p and %x read values from the stack that were never passed as arguments, and %n can even write memory.\n\nSolving it: the captured run with %p %p %p leaks consecutive stack words. Each word is 8 bytes printed little-endian, so reverse the bytes of each word, convert to ASCII and concatenate. The secret stored on the stack reads out as the flag.\n\nThe fix: always pass a constant format string: printf("%s", user_input). Compiler warnings such as -Wformat-security catch this at build time.'),

  ('c-forensics-1', E'The vulnerability: data hidden after the end of a file. Image viewers stop at the JPEG end-of-image marker, FF D9, so anything appended after it is invisible but still part of the file.\n\nSolving it: the file is larger than a tiny image of its dimensions should be. In a hex viewer, find the final FF D9; the bytes after it are readable text containing the flag. binwalk, or simply strings, find it too.\n\nThe lesson for defenders: uploaded files should be re-encoded or stripped to their declared structure before storage or sharing, and data loss prevention should not trust a file just because it opens as an image.'),

  ('c-forensics-2', E'The vulnerability: deleting a file usually removes only its directory entry. The data blocks stay on disk until something overwrites them.\n\nSolving it: with no filesystem index left, carve by signature. Search the raw image for the PNG magic bytes 89 50 4E 47, take everything up to the IEND chunk, and read the tEXt chunk inside it, which carries the flag. Tools such as foremost or photorec automate the same idea.\n\nThe lesson for defenders: deletion is not erasure. Use full-disk encryption and crypto-erase, or a secure wipe, when retiring media that held sensitive data.'),

  ('c-forensics-3', E'The vulnerability: an unsaved document still lives in the editor''s process memory, in plain text, until the memory is freed and reused. A memory dump captures it.\n\nSolving it: most of the dump is binary noise. Extracting runs of four or more printable characters (the strings technique) surfaces the document text, and searching that output for the flag prefix finds the flag. Volatility adds process context on real dumps.\n\nThe lesson for defenders: secrets in memory are exposed to anyone who can dump it. Restrict debugging and dump privileges, protect crash dumps like the data they contain, and clear sensitive buffers when done.'),

  ('c-network-1', E'The vulnerability: a login form submitted over plain HTTP. Anyone on the network path sees the request body, password included.\n\nSolving it: filter the capture to HTTP, find the POST to the login endpoint and follow its TCP stream. The URL-encoded form body holds the username and the password, and the password is the flag.\n\nThe fix: serve every page over HTTPS, redirect HTTP to HTTPS, and send Strict-Transport-Security so browsers never fall back to plain text.'),

  ('c-network-2', E'The vulnerability: DNS tunneling. DNS is often allowed out of networks that block everything else, so data can be smuggled out inside query names.\n\nSolving it: one domain receives an unusual burst of queries whose first labels contain only hex characters. Joining those labels in capture order and hex-decoding the result gives the flag. The single query for an ordinary hostname is cover traffic.\n\nThe lesson for defenders: force clients through internal resolvers, and alert on high query volume to one domain, long or high-entropy labels, and many unique subdomains.');
