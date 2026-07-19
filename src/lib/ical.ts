// Minimal RFC5545 (iCalendar) parser/generator — just enough to exchange
// whole-day availability blocks with Airbnb's .ics feeds. No external
// dependency: Airbnb's own export/import format is a small, predictable
// subset of the spec (VEVENTs with UID/DTSTART/DTEND/SUMMARY), so a
// hand-rolled reader keeps this feature self-contained.

export type ParsedIcsEvent = {
  uid: string;
  summary: string;
  /** Calendar day the event starts, as a UTC-midnight Date (day-only precision). */
  start: Date;
  /** Calendar day the event ends (RFC5545 DTEND is exclusive — the day after the last occupied night). */
  end: Date;
  cancelled: boolean;
};

/** RFC5545 §3.1: a line starting with a single space or tab continues the previous line. */
function unfoldLines(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.trim().length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

/** Parses a DTSTART/DTEND value (with its optional ;PARAM=... prefix already stripped from the key) into a UTC-midnight Date representing the calendar day. */
function parseIcsDate(value: string): Date {
  const digits = value.replace(/[^0-9]/g, "");
  const year = +digits.slice(0, 4);
  const month = +digits.slice(4, 6) - 1;
  const day = +digits.slice(6, 8);
  return new Date(Date.UTC(year, month, day));
}

export function parseICS(text: string): ParsedIcsEvent[] {
  if (!text.includes("BEGIN:VCALENDAR")) {
    throw new Error("Not a valid iCalendar (.ics) file — missing BEGIN:VCALENDAR.");
  }
  const lines = unfoldLines(text);
  const events: ParsedIcsEvent[] = [];
  let cur: Record<string, string> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.DTSTART) {
        const start = parseIcsDate(cur.DTSTART);
        const end = cur.DTEND ? parseIcsDate(cur.DTEND) : new Date(start.getTime() + 24 * 3600 * 1000);
        const status = (cur.STATUS ?? "").toUpperCase();
        events.push({
          uid: cur.UID ?? "",
          summary: cur.SUMMARY ?? "",
          start,
          end,
          cancelled: status === "CANCELLED",
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const rawKey = line.slice(0, colonIdx);
    const value = line.slice(colonIdx + 1);
    const key = rawKey.split(";")[0].toUpperCase();
    if (key === "UID" || key === "SUMMARY" || key === "STATUS") cur[key] = value;
    if (key === "DTSTART" || key === "DTEND") cur[key] = value;
  }

  return events.filter((e) => e.uid);
}

/** Folds a content line to <=75 octets per RFC5545 §3.1, continuation lines prefixed with a space. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    out += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

function formatIcsDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcsDateTime(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}${String(d.getUTCSeconds()).padStart(2, "0")}Z`;
}

export function generateICS(params: {
  calName: string;
  events: { uid: string; summary: string; start: Date; end: Date; location?: string; description?: string; lastModified?: Date }[];
}): string {
  const stamp = formatIcsDateTime(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Evangelina's Staycation//Booking Sync//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcsText(params.calName)}`,
  ];

  for (const ev of params.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${ev.uid}`,
      `DTSTAMP:${stamp}`,
      `LAST-MODIFIED:${formatIcsDateTime(ev.lastModified ?? new Date())}`,
      `DTSTART;VALUE=DATE:${formatIcsDateOnly(ev.start)}`,
      `DTEND;VALUE=DATE:${formatIcsDateOnly(ev.end)}`,
      `SUMMARY:${escapeIcsText(ev.summary)}`,
      ...(ev.location ? [`LOCATION:${escapeIcsText(ev.location)}`] : []),
      ...(ev.description ? [`DESCRIPTION:${escapeIcsText(ev.description)}`] : []),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}
