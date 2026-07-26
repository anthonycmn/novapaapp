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
