import type { VolunteerKind } from "@/lib/api/types";

/**
 * The kinds of help a volunteer slot can ask for (hub 0096). The list is a
 * check constraint on family_hub.volunteer_slots.kind and the staff portal
 * carries the same labels — a new kind is a migration in both places.
 */
export const VOLUNTEER_KINDS: Record<VolunteerKind, { label: string; bring?: true }> = {
  front_of_house: { label: "Front of house" },
  concessions: { label: "Concessions" },
  backstage: { label: "Backstage crew" },
  setup: { label: "Set-up / load-in" },
  strike: { label: "Strike" },
  bring_food: { label: "Bring food", bring: true },
  potluck: { label: "Potluck dish", bring: true },
  supplies: { label: "Bring supplies", bring: true },
  chaperone: { label: "Chaperone" },
  other: { label: "Other" },
};

/** Food and supplies slots ask what you are bringing; everybody sees it. */
export function asksWhatYouBring(kind: VolunteerKind): boolean {
  return Boolean(VOLUNTEER_KINDS[kind]?.bring);
}

/**
 * True when the 24-hour line has passed and a family can no longer give the
 * place back or move it here. The database holds the same line
 * (release_ / move_volunteer_signup); this only decides which buttons to show.
 */
export function insideTwentyFourHours(countsFrom: string | null, now = Date.now()): boolean {
  if (!countsFrom) return false;
  return new Date(countsFrom).getTime() - 24 * 3600_000 <= now;
}
