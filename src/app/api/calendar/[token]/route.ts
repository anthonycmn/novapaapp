import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { buildFamilyIcs } from "@/lib/ical";

/**
 * Tokenized iCal feed (#5): unique unguessable URL per family, no login
 * needed (calendar apps can't authenticate). Knowing the token grants read
 * access to that one family's schedule only; families can regenerate it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const provider = getProvider();

  const familyId = await provider.getFamilyIdByCalendarToken(token);
  if (!familyId) {
    return new NextResponse("Not found", { status: 404 });
  }

  // The feed is served on behalf of the family's primary parent.
  // (In Supabase mode this runs with a scoped service query instead.)
  const { users, students, families } = await import("@/lib/api/mock/seed-data");
  const parent = users.find((u) => u.role === "parent" && u.familyId === familyId);
  const family = families.find((f) => f.id === familyId);
  if (!parent || !family) return new NextResponse("Not found", { status: 404 });

  const events = await provider.getFamilyCalendar(parent.id, familyId);
  const studentNamesById = Object.fromEntries(
    students
      .filter((s) => s.familyId === familyId)
      .map((s) => [s.id, s.preferredName ?? s.firstName])
  );

  const ics = buildFamilyIcs(events, { familyName: family.name, studentNamesById });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="novapa-family.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
