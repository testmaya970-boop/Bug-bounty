// iCalendar (RFC 5545) export of a researcher's dates. Pure, so it is unit tested; no calendar
// provider is involved, the file is just downloaded.

export type CalendarItem = { uid: string; title: string; startsAt: string; endsAt: string; url: string; description?: string };

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text per RFC 5545 3.3.11 and folds lines at 75 octets. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(items: CalendarItem[], now = new Date().toISOString()): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Unpatched//Researcher calendar//EN", "CALSCALE:GREGORIAN"];
  for (const item of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.uid}@unpatched`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(item.startsAt)}`,
      `DTEND:${stamp(item.endsAt)}`,
      `SUMMARY:${escapeText(item.title)}`,
      `URL:${item.url}`,
      ...(item.description ? [`DESCRIPTION:${escapeText(item.description)}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
