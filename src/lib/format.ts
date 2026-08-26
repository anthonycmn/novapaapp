import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";

/** Format a UTC ISO timestamp for display in the org's time zone. */
export function formatEventTime(isoUtc: string): string {
  return formatInTimeZone(new Date(isoUtc), org.timeZone, "EEE, MMM d · h:mm a");
}

export function formatDate(isoUtc: string): string {
  return formatInTimeZone(new Date(isoUtc), org.timeZone, "MMM d, yyyy");
}

export function formatTime(isoUtc: string): string {
  return formatInTimeZone(new Date(isoUtc), org.timeZone, "h:mm a");
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Is this call time worth showing?
 *
 * A call that equals the start is not a call time — it is the same fact
 * printed twice, and printing it twice is what made a parent write in on
 * 25 Aug 2026 to say the two looked identical. Null, missing, or equal to the
 * start: say nothing.
 *
 * The underlying data problem is separate and worse (a performance whose
 * starts_at held the CALL and whose curtain lived only in the title), but this
 * is the rule that keeps the screen honest whatever the data does next.
 */
export function showableCallTime(
  callTime: string | null | undefined,
  startsAt: string | null | undefined
): string | null {
  if (!callTime) return null
  if (callTime === startsAt) return null
  return callTime
}
