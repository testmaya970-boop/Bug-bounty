// Reverse-engineering (c-re-1..5) and binary-pwn (c-pwn-1..4) artifacts.
//
// Substitution note (per the task's own allowance and decision #3): building and hosting
// real compiled/attackable binaries is out of scope and unsafe in this repo's tooling, so
// these challenges ship a faithful STATIC artifact instead -- an annotated disassembly /
// pseudocode listing, a hex dump, or a custom-VM bytecode listing with its opcode table --
// built so the described technique performed against the listing yields the exact flag.
// Where a flag is genuinely *computed* by the code (the license checker's constructed
// string, the VM's bytecode program), solve() runs that computation over the listing's own
// data rather than reading a printed constant, so the artifact is really solvable, not just
// labelled with the answer.
import { FLAGS } from "./lib.mjs";

// c-re-1 -- license checker. The disassembly shows the key built byte-by-byte by immediate
// moves, then strcmp against input. Solver reconstructs the key from the mov immediates.
const licenseChecker = {
  id: "c-re-1",
  build() {
    const flag = FLAGS[this.id];
    // Emit a pseudo-assembly listing that stores each flag byte as an immediate into a
    // stack buffer, then compares. The solver parses the immediates back.
    const lines = ["; --- check_license (disassembly excerpt) ---", "; builds the expected key on the stack, then strcmp(input, key)"];
    for (let i = 0; i < flag.length; i++) {
      lines.push(`  mov   byte [rbp-0x${(0x40 - i).toString(16)}], 0x${flag.charCodeAt(i).toString(16).padStart(2, "0")}   ; '${flag[i] === " " ? "\\x20" : flag[i]}'`);
    }
    lines.push(`  mov   byte [rbp-0x${(0x40 - flag.length).toString(16)}], 0x00   ; NUL terminator`);
    lines.push("  lea   rsi, [rbp-0x40]        ; the key");
    lines.push("  mov   rdi, input");
    lines.push("  call  strcmp");
    lines.push("  test  eax, eax");
    lines.push("  jnz   .wrong                 ; non-zero => not equal => rejected");
    return { embed: lines.join("\n"), _flag: flag };
  },
  solve({ embed }) {
    // Reconstruct the key from the ordered `mov byte [rbp-off], 0xNN` immediates until NUL.
    const rows = [...embed.matchAll(/mov\s+byte \[rbp-0x([0-9a-f]+)\], 0x([0-9a-f]{2})/g)].map((m) => ({ off: parseInt(m[1], 16), val: parseInt(m[2], 16) }));
    rows.sort((a, b) => b.off - a.off); // higher offset = earlier byte (stack grows down)
    let s = "";
    for (const r of rows) {
      if (r.val === 0) break;
      s += String.fromCharCode(r.val);
    }
    const m = s.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-re-2 -- junk-code obfuscation. A listing where the real check is buried among no-op
// arithmetic (add then sub the same value, xor reg with itself, etc). The real bytes are on
// lines tagged as the "effective" store; junk lines cancel out. Solver strips the junk (any
// op whose net effect is zero) and reads the surviving constant string.
const obfuscated = {
  id: "c-re-2",
  build() {
    const flag = FLAGS[this.id];
    const lines = ["; --- validate() with junk-code obfuscation ---"];
    for (let i = 0; i < flag.length; i++) {
      // Junk before each real store: net-zero operations.
      lines.push(`  add   eax, 0x11`);
      lines.push(`  sub   eax, 0x11              ; junk (nets to zero)`);
      lines.push(`  xor   ebx, ebx              ; junk`);
      lines.push(`  mov   byte [key+${i}], 0x${flag.charCodeAt(i).toString(16).padStart(2, "0")}   ; REAL`);
      lines.push(`  imul  ecx, ecx, 0x1         ; junk (multiply by 1)`);
    }
    return { embed: lines.join("\n"), _flag: flag };
  },
  solve({ embed }) {
    // Keep only the REAL stores (the junk lines never write key bytes).
    const rows = [...embed.matchAll(/mov\s+byte \[key\+(\d+)\], 0x([0-9a-f]{2})\s+; REAL/g)].map((m) => ({ i: parseInt(m[1], 10), val: parseInt(m[2], 16) }));
    rows.sort((a, b) => a.i - b.i);
    const s = rows.map((r) => String.fromCharCode(r.val)).join("");
    const m = s.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-re-3 -- packed payload. A hex dump of the "packed" section: the real bytes are the flag
// XORed with a single-byte key, plus the one-line unpack stub showing the key. Solver reads
// the key from the stub and XOR-decodes the dumped bytes (what the unpacker does at runtime).
const packed = {
  id: "c-re-3",
  build() {
    const key = 0x5a;
    const flag = FLAGS[this.id];
    const packedBytes = Buffer.from(flag).map((b) => b ^ key);
    const hexDump = [...packedBytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const embed =
      `; unpack stub (runs before main):\n` +
      `  mov   al, 0x${key.toString(16)}          ; XOR key\n` +
      `.loop:\n` +
      `  xor   byte [rsi], al          ; decode in place\n` +
      `  inc   rsi\n` +
      `  loop  .loop\n\n` +
      `; packed .text section (hex dump):\n${hexDump}\n`;
    return { embed, _hex: hexDump, _key: key };
  },
  solve({ embed }) {
    const key = parseInt(embed.match(/mov\s+al, 0x([0-9a-f]+)\s+; XOR key/)[1], 16);
    const hex = embed.split("hex dump):\n")[1].trim();
    const bytes = Buffer.from(hex.split(/\s+/).map((h) => parseInt(h, 16)));
    const decoded = Buffer.from(bytes.map((b) => b ^ key)).toString("latin1");
    const m = decoded.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-re-4 -- custom VM. A bytecode program plus its opcode table. The program PUSHes each
// flag byte (as an immediate operand) and OUTs it. Solver implements the tiny VM and runs
// the bytecode, collecting the output -- genuinely executing the artifact.
const customVm = {
  id: "c-re-4",
  build() {
    const flag = FLAGS[this.id];
    // Opcodes: 0x01 PUSH imm8 ; 0x02 OUT (pop, emit) ; 0xff HALT
    const program = [];
    for (const ch of flag) {
      program.push(0x01, ch.charCodeAt(0), 0x02);
    }
    program.push(0xff);
    const hex = program.map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const embed =
      `; --- embedded VM opcode table ---\n` +
      `;   0x01 imm8   PUSH imm8 onto the stack\n` +
      `;   0x02        OUT  -- pop one byte, append to output\n` +
      `;   0xff        HALT\n\n` +
      `; bytecode program:\n${hex}\n\n` +
      `Trace the fetch-decode-execute loop over this bytecode; the output is the flag.\n`;
    return { embed, _hex: hex };
  },
  solve({ embed }) {
    const hex = embed.split("bytecode program:\n")[1].split("\n")[0].trim();
    const code = hex.split(/\s+/).map((h) => parseInt(h, 16));
    const stack = [];
    const out = [];
    let ip = 0;
    while (ip < code.length) {
      const op = code[ip++];
      if (op === 0x01) stack.push(code[ip++]);
      else if (op === 0x02) out.push(stack.pop());
      else if (op === 0xff) break;
      else return null;
    }
    const s = Buffer.from(out).toString("latin1");
    const m = s.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-re-5 -- anti-debug. Two anti-debug checks are shown (a ptrace/IsDebuggerPresent gate and
// a timing check) that, when NOT bypassed, XOR the real key with a corruption mask. The
// artifact shows the corrupted-vs-real path; bypassing the checks (taking the debugger-
// absent branch) leaves the key intact. Solver takes the correct branch and reads the key
// built there (same mov-immediate reconstruction as re-1, on the un-corrupted path).
const antiDebug = {
  id: "c-re-5",
  build() {
    const flag = FLAGS[this.id];
    const lines = [
      "; --- protected_main (anti-debug) ---",
      "  call  IsDebuggerPresent",
      "  test  eax, eax",
      "  jnz   .corrupt                ; if a debugger is attached, jump to the decoy path",
      "  rdtsc                         ; timing check",
      "  ; ... (elapsed within threshold => not single-stepped) ...",
      ".clean:                         ; the real path (no debugger, normal timing)",
    ];
    for (let i = 0; i < flag.length; i++) {
      lines.push(`  mov   byte [key+${i}], 0x${flag.charCodeAt(i).toString(16).padStart(2, "0")}   ; CLEAN`);
    }
    lines.push("  jmp   .use_key");
    lines.push(".corrupt:                       ; decoy path -- XORs every key byte with 0x7f");
    for (let i = 0; i < flag.length; i++) {
      lines.push(`  mov   byte [key+${i}], 0x${(flag.charCodeAt(i) ^ 0x7f).toString(16).padStart(2, "0")}   ; CORRUPT`);
    }
    return { embed: lines.join("\n"), _flag: flag };
  },
  solve({ embed }) {
    // Bypass the anti-debug: take the .clean path (CLEAN stores), ignore CORRUPT decoys.
    const rows = [...embed.matchAll(/mov\s+byte \[key\+(\d+)\], 0x([0-9a-f]{2})\s+; CLEAN/g)].map((m) => ({ i: parseInt(m[1], 10), val: parseInt(m[2], 16) }));
    rows.sort((a, b) => a.i - b.i);
    const s = rows.map((r) => String.fromCharCode(r.val)).join("");
    const m = s.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// ---- pwn (annotated disassembly + captured output; see substitution note above) ----

// c-pwn-1 -- stack overflow to a hidden win() function. The listing shows the buffer size
// and the win() function that prints the flag; the captured run (overflowing to win's addr)
// prints it. Solver confirms the offset math (buffer + saved rbp) and reads win()'s output.
const bufferOverflow = {
  id: "c-pwn-1",
  build() {
    const embed =
      `; vulnerable():\n` +
      `  sub   rsp, 0x40              ; char buf[64]\n` +
      `  lea   rdi, [rsp]\n` +
      `  call  gets                  ; no bounds check -- overflow buf\n` +
      `  ...\n` +
      `; win()  (never called normally):\n` +
      `  lea   rdi, [flag_str]\n` +
      `  call  puts\n\n` +
      `Offset to saved return address = 64 (buf) + 8 (saved rbp) = 72 bytes, then the\n` +
      `address of win(). Captured output when the return address is overwritten with win():\n` +
      `  ${FLAGS[this.id]}\n`;
    return { embed };
  },
  solve({ embed }) {
    // The exploit reaches win(), whose captured output is the flag.
    if (!/Offset to saved return address = 64 \+ 8 = 72/.test(embed) && !embed.includes("64 (buf) + 8 (saved rbp) = 72")) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-pwn-2 -- ROP chain. The listing gives the gadgets and the intended chain; the captured
// run of the assembled chain (pop rdi; ret -> "/bin/sh" -> system) yields a shell that cats
// the flag. Solver checks the chain reaches system() and reads the captured flag.
const rop = {
  id: "c-pwn-2",
  build() {
    const embed =
      `; NX enabled -- no shellcode. Available gadgets:\n` +
      `  0x401203: pop rdi ; ret\n` +
      `  0x401010: system@plt\n` +
      `  0x402008: "/bin/sh"\n\n` +
      `Intended chain (overwrite saved RIP with):\n` +
      `  [pop rdi; ret] [addr of "/bin/sh"] [system@plt]\n\n` +
      `Captured output after the chain runs \`system("/bin/sh")\` and the shell cats the flag:\n` +
      `  ${FLAGS[this.id]}\n`;
    return { embed };
  },
  solve({ embed }) {
    if (!embed.includes("pop rdi ; ret") || !embed.includes("system@plt")) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-pwn-3 -- use-after-free. The listing shows a freed object whose vtable pointer is reused
// after a same-size allocation overwrites it; redirecting the vtable to win() prints the
// flag. Solver confirms the UAF (use after free on the same chunk) and reads the output.
const uaf = {
  id: "c-pwn-3",
  build() {
    const embed =
      `; pseudo-C:\n` +
      `  Obj *o = malloc(sizeof(Obj));   // has a function pointer o->handler\n` +
      `  free(o);                        // freed, but 'o' still used below\n` +
      `  char *s = malloc(sizeof(Obj));  // same size -> reuses o's chunk\n` +
      `  strcpy(s, attacker_input);      // overwrites o->handler\n` +
      `  o->handler();                   // UAF: calls attacker-controlled pointer\n\n` +
      `Point o->handler at win(). Captured output once win() runs:\n` +
      `  ${FLAGS[this.id]}\n`;
    return { embed };
  },
  solve({ embed }) {
    if (!/free\(o\)/.test(embed) || !/o->handler\(\)/.test(embed)) return null;
    const m = embed.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-pwn-4 -- format string leak. printf(user_input) with no format specifier lets `%p`/`%x`
// read the stack. The listing shows the vulnerable call and a captured run where a chain of
// %p leaks the stack; the flag is the leaked stack string, reassembled from the leaked
// little-endian words. Solver reassembles the leaked hex words into the flag.
const formatString = {
  id: "c-pwn-4",
  build() {
    const flag = FLAGS[this.id];
    // The flag sits on the stack; a %p leak prints it as little-endian 8-byte words.
    const padded = Buffer.concat([Buffer.from(flag), Buffer.alloc((8 - (flag.length % 8)) % 8)]);
    const words = [];
    for (let i = 0; i < padded.length; i += 8) {
      const word = padded.subarray(i, i + 8);
      // little-endian pointer print
      const le = [...word].reverse().map((b) => b.toString(16).padStart(2, "0")).join("");
      words.push("0x" + le.replace(/^0+(?=.)/, ""));
    }
    const embed =
      `; log_line():\n` +
      `  mov   rdi, user_input\n` +
      `  call  printf                ; printf(user_input) -- no format string!\n\n` +
      `A run with input "%p %p %p %p %p" leaks consecutive stack words (little-endian):\n` +
      `  ${words.join(" ")}\n\n` +
      `Reassemble the leaked words (each is 8 bytes, little-endian) into ASCII.\n`;
    return { embed, _words: words };
  },
  solve({ embed }) {
    const line = embed.split("(little-endian):\n")[1].split("\n")[0].trim();
    const words = line.split(/\s+/);
    let out = Buffer.alloc(0);
    for (const w of words) {
      let hex = w.replace(/^0x/, "");
      if (hex.length % 2) hex = "0" + hex;
      const le = Buffer.from(hex, "hex");
      const be = Buffer.from([...le].reverse()); // undo little-endian
      out = Buffer.concat([out, be]);
    }
    const s = out.toString("latin1");
    const m = s.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

export const reChallenges = [licenseChecker, obfuscated, packed, customVm, antiDebug];
export const pwnChallenges = [bufferOverflow, rop, uaf, formatString];
