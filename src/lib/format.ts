export function peso(n: number | null | undefined): string {
  const v = Math.round(n ?? 0);
  return "₱" + v.toLocaleString("en-PH");
}

export function fmtDate(d: Date | string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-PH", opts);
}

export function fmtTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** Formats a "HH:MM" 24-hour time-input value (e.g. from <input type="time">) as "2:30 PM". */
export function fmtTimeStr(t: string | null | undefined): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
