const TIME_ZONE = "Asia/Colombo";

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Formats a date the way Sri Lankan offices write it: YYYY.MM.DD, in Colombo time (UI-3, ARC-6).
 * A plain "YYYY-MM-DD" string is treated as that calendar day, whatever the server's time zone.
 */
export function formatDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.replaceAll("-", ".");

  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a valid date: ${String(value)}`);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.formatToParts(date).find((p) => p.type === type)?.value;
  return `${get("year")}.${get("month")}.${get("day")}`;
}
