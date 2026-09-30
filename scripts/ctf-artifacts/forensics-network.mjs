// Forensics (c-forensics-1..3) and network (c-network-1..3) artifacts. These produce real
// downloadable files (a JPEG with trailing data, a carvable blob, a memory-dump blob, and
// real .pcap captures) written under public/ctf-artifacts/<id>/. Each solve() reads the
// bytes back and recovers the flag with the intended technique.
import { FLAGS, randomBytesDet } from "./lib.mjs";

// ---- forensics ----

// c-forensics-1 -- data appended after a JPEG's EOI (FF D9) marker. A real, tiny but valid
// baseline JPEG, then the flag bytes appended after end-of-image. Solver finds FF D9 and
// reads what follows.
const hiddenStream = {
  id: "c-forensics-1",
  files() {
    // Minimal valid JPEG: SOI, APP0/JFIF, a DQT, SOF0, DHT, SOS with a single MCU of gray,
    // then EOI. We don't need a decodable image for the technique (data-after-EOI), only a
    // real EOI marker; but we build a well-formed-enough header so `file` calls it a JPEG.
    const soi = Buffer.from([0xff, 0xd8]);
    const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
    const comment = Buffer.concat([Buffer.from([0xff, 0xfe]), lenPrefixed(Buffer.from("Unpatched specimen photo"))]);
    const body = randomBytesDet("forensics-1:scan", 512); // stand-in compressed scan data
    const eoi = Buffer.from([0xff, 0xd9]);
    const appended = Buffer.from(`\n${FLAGS[this.id]}\n`); // the hidden stream after EOI
    const jpeg = Buffer.concat([soi, jfif, comment, body, eoi, appended]);
    return { "specimen.jpg": jpeg };
  },
  solve(files) {
    const buf = files["specimen.jpg"];
    const eoi = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
    if (eoi < 0) return null;
    const trailing = buf.subarray(eoi + 2).toString("latin1");
    const m = trailing.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

function lenPrefixed(payload) {
  const len = payload.length + 2;
  return Buffer.concat([Buffer.from([(len >> 8) & 0xff, len & 0xff]), payload]);
}

// c-forensics-2 -- file carving. A raw "disk image" blob: random slack, then an embedded
// PNG whose header magic is intact and whose tEXt chunk carries the flag, then more slack.
// The directory entry is "gone" (no filesystem) -- you carve by scanning for the PNG magic.
const deletedHistory = {
  id: "c-forensics-2",
  files() {
    const pre = randomBytesDet("forensics-2:pre", 800);
    const post = randomBytesDet("forensics-2:post", 600);
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = pngChunk("IHDR", Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])); // 1x1
    const text = pngChunk("tEXt", Buffer.from(`flag\x00${FLAGS[this.id]}`));
    const iend = pngChunk("IEND", Buffer.alloc(0));
    const png = Buffer.concat([pngMagic, ihdr, text, iend]);
    return { "disk.img": Buffer.concat([pre, png, post]) };
  },
  solve(files) {
    const buf = files["disk.img"];
    const magic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const start = buf.indexOf(magic);
    if (start < 0) return null;
    // Read the tEXt chunk content directly from the carved region.
    const carved = buf.subarray(start).toString("latin1");
    const m = carved.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "latin1");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// c-forensics-3 -- memory-dump strings. A binary blob of mostly non-printable bytes with
// the "unsaved document" text (containing the flag) sitting in a printable region. Solver
// runs the `strings` technique: extract runs of >=4 printable chars, find the flag.
const memoryDump = {
  id: "c-forensics-3",
  files() {
    const chunkA = randomBytesDet("forensics-3:a", 4096);
    const doc = Buffer.from(`Meeting notes (unsaved):\nRemember to rotate the signing key. Temporary passphrase ${FLAGS[this.id]} until then.\n`);
    const chunkB = randomBytesDet("forensics-3:b", 4096);
    return { "process.dmp": Buffer.concat([chunkA, doc, chunkB]) };
  },
  solve(files) {
    const buf = files["process.dmp"];
    // strings: printable ASCII runs of length >= 4.
    const runs = buf.toString("latin1").match(/[\x20-\x7e]{4,}/g) || [];
    for (const r of runs) {
      const m = r.match(/unpatched\{[^}]+\}/);
      if (m) return m[0];
    }
    return null;
  },
};

// ---- network (real .pcap files, classic global-header + per-packet records) ----

const PCAP_MAGIC = 0xa1b2c3d4;
function pcapGlobalHeader() {
  const b = Buffer.alloc(24);
  b.writeUInt32LE(PCAP_MAGIC, 0);
  b.writeUInt16LE(2, 4); // version major
  b.writeUInt16LE(4, 6); // version minor
  b.writeInt32LE(0, 8); // thiszone
  b.writeUInt32LE(0, 12); // sigfigs
  b.writeUInt32LE(65535, 16); // snaplen
  b.writeUInt32LE(1, 20); // network = LINKTYPE_ETHERNET
  return b;
}
function pcapRecord(payload, tsSec) {
  const hdr = Buffer.alloc(16);
  hdr.writeUInt32LE(tsSec, 0);
  hdr.writeUInt32LE(0, 4);
  hdr.writeUInt32LE(payload.length, 8); // incl_len
  hdr.writeUInt32LE(payload.length, 12); // orig_len
  return Buffer.concat([hdr, payload]);
}
// Minimal Ethernet+IPv4+TCP/UDP framing so Wireshark parses these as real packets. We keep
// checksums zero (Wireshark shows "incorrect" but still dissects) -- fine for a CTF pcap.
function ethIpv4(proto, srcPort, dstPort, appPayload) {
  const eth = Buffer.concat([Buffer.from([0x02, 0, 0, 0, 0, 1]), Buffer.from([0x02, 0, 0, 0, 0, 2]), Buffer.from([0x08, 0x00])]);
  let l4;
  if (proto === 6) {
    const tcp = Buffer.alloc(20);
    tcp.writeUInt16BE(srcPort, 0);
    tcp.writeUInt16BE(dstPort, 2);
    tcp[12] = 0x50; // data offset 5 words
    tcp[13] = 0x18; // PSH+ACK
    l4 = Buffer.concat([tcp, appPayload]);
  } else {
    const udp = Buffer.alloc(8);
    udp.writeUInt16BE(srcPort, 0);
    udp.writeUInt16BE(dstPort, 2);
    udp.writeUInt16BE(8 + appPayload.length, 4);
    l4 = Buffer.concat([udp, appPayload]);
  }
  const ip = Buffer.alloc(20);
  ip[0] = 0x45;
  ip.writeUInt16BE(20 + l4.length, 2);
  ip[8] = 64; // TTL
  ip[9] = proto;
  ip.writeUInt32BE(0xc0a80101, 12); // 192.168.1.1
  ip.writeUInt32BE(0xc0a80102, 16); // 192.168.1.2
  return Buffer.concat([eth, ip, l4]);
}

// c-network-1 -- plaintext creds in a pcap. An HTTP POST login over cleartext; the flag is
// the password field. Solver reassembles TCP payloads and reads the form body.
const unencryptedLogin = {
  id: "c-network-1",
  files() {
    const body = `username=admin&password=${FLAGS[this.id]}`;
    const http = Buffer.from(`POST /login HTTP/1.1\r\nHost: intranet.example\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: ${body.length}\r\n\r\n${body}`);
    const packets = [
      ethIpv4(6, 49512, 80, Buffer.from("GET / HTTP/1.1\r\nHost: intranet.example\r\n\r\n")),
      ethIpv4(6, 49512, 80, http),
    ];
    return { "capture.pcap": buildPcap(packets) };
  },
  solve(files) {
    const payloads = parsePcapAppPayloads(files["capture.pcap"]);
    const joined = payloads.map((p) => p.toString("latin1")).join("\n");
    const m = joined.match(/password=(unpatched\{[^}&]+\})/);
    return m ? m[1] : null;
  },
};

// c-network-2 -- DNS tunneling. A burst of DNS A queries whose subdomain labels are hex
// chunks of the exfiltrated flag. Solver extracts the labels for the tunnel domain, hex-
// decodes their concatenation.
const hiddenChannel = {
  id: "c-network-2",
  files() {
    const hex = Buffer.from(FLAGS[this.id]).toString("hex");
    const chunks = hex.match(/.{1,16}/g); // 8 bytes per label
    const packets = chunks.map((chunk, i) => ethIpv4(17, 53000 + i, 53, dnsQuery(`${chunk}.tunnel.example`)));
    // A little cover traffic so it looks like a capture, not a single query.
    packets.unshift(ethIpv4(17, 52000, 53, dnsQuery("www.example.com")));
    return { "dns.pcap": buildPcap(packets) };
  },
  solve(files) {
    const payloads = parsePcapAppPayloads(files["dns.pcap"]);
    const labels = [];
    for (const p of payloads) {
      const name = parseDnsQName(p);
      if (name && name.endsWith(".tunnel.example")) labels.push(name.split(".")[0]);
    }
    const hex = labels.join("");
    const decoded = Buffer.from(hex, "hex").toString("latin1");
    const m = decoded.match(/unpatched\{[^}]+\}/);
    return m ? m[0] : null;
  },
};

// c-network-3 -- protocol downgrade. The capture shows a client offering TLS 1.3 but the
// (MITM-tampered) ServerHello forcing an export-grade cipher, after which an application
// record is readable. The recovered plaintext (the flag) is carried in that weak-session
// application record; the artifact also includes a readable notes packet describing the
// negotiated-vs-offered mismatch so the technique is demonstrable statically.
const downgrade = {
  id: "c-network-3",
  files() {
    const notes =
      `ClientHello offered: TLS 1.3, TLS 1.2 (strong ciphers)\n` +
      `ServerHello (tampered) selected: TLS 1.0, TLS_RSA_EXPORT_WITH_RC4_40 (broken export cipher)\n` +
      `The version was forced DOWN mid-handshake. The export cipher's tiny key is trivially\n` +
      `brute-forced, so the following application record decrypts to:\n` +
      `${FLAGS[this.id]}\n`;
    // A plaintext "keylog + decrypted record" packet (as a network-analysis tool would show
    // after breaking the weak cipher), plus a couple of framing packets.
    const packets = [
      ethIpv4(6, 51000, 443, Buffer.from("TLS ClientHello: supported_versions=0x0304,0x0303")),
      ethIpv4(6, 443, 51000, Buffer.from("TLS ServerHello: version=0x0301 cipher=TLS_RSA_EXPORT_WITH_RC4_40")),
      ethIpv4(6, 443, 51000, Buffer.from(`DECRYPTED application_data: ${FLAGS[this.id]}`)),
    ];
    return { "tls-downgrade.pcap": buildPcap(packets), "analysis.txt": Buffer.from(notes) };
  },
  solve(files) {
    const payloads = parsePcapAppPayloads(files["tls-downgrade.pcap"]);
    for (const p of payloads) {
      const s = p.toString("latin1");
      if (s.includes("DECRYPTED application_data")) {
        const m = s.match(/unpatched\{[^}]+\}/);
        if (m) return m[0];
      }
    }
    return null;
  },
};

// ---- pcap + dns helpers ----
function buildPcap(packets) {
  const parts = [pcapGlobalHeader()];
  packets.forEach((p, i) => parts.push(pcapRecord(p, 1700000000 + i)));
  return Buffer.concat(parts);
}
function parsePcapAppPayloads(buf) {
  const out = [];
  let off = 24; // skip global header
  while (off + 16 <= buf.length) {
    const inclLen = buf.readUInt32LE(off + 8);
    const start = off + 16;
    const frame = buf.subarray(start, start + inclLen);
    out.push(extractAppPayload(frame));
    off = start + inclLen;
  }
  return out;
}
function extractAppPayload(frame) {
  // Ethernet(14) + IPv4(20) + L4 header. Read proto to size the L4 header.
  if (frame.length < 34) return Buffer.alloc(0);
  const proto = frame[14 + 9];
  const l4 = 14 + 20;
  if (proto === 6) return frame.subarray(l4 + 20); // TCP header 20
  if (proto === 17) return frame.subarray(l4 + 8); // UDP header 8
  return Buffer.alloc(0);
}
function dnsQuery(name) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0x1234, 0); // id
  header.writeUInt16BE(0x0100, 2); // recursion desired
  header.writeUInt16BE(1, 4); // qdcount
  const labels = name.split(".");
  const qname = Buffer.concat(labels.map((l) => Buffer.concat([Buffer.from([l.length]), Buffer.from(l)])).concat([Buffer.from([0])]));
  const qtail = Buffer.from([0x00, 0x01, 0x00, 0x01]); // QTYPE A, QCLASS IN
  return Buffer.concat([header, qname, qtail]);
}
function parseDnsQName(payload) {
  if (payload.length < 13) return null;
  let off = 12;
  const parts = [];
  while (off < payload.length) {
    const len = payload[off];
    if (len === 0) break;
    if (off + 1 + len > payload.length) return null;
    parts.push(payload.subarray(off + 1, off + 1 + len).toString("latin1"));
    off += 1 + len;
  }
  return parts.join(".") || null;
}

export const forensicsNetworkChallenges = [hiddenStream, deletedHistory, memoryDump, unencryptedLogin, hiddenChannel, downgrade];
