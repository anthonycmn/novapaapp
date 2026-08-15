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

  // The feed renders on behalf of a member of the family. Supabase mode
  // resolves them from the real database; mock mode from seed data.
  let actorId: string | undefined;
  let familyName: string | undefined;
  let studentNamesById: Record<string, string> = {};

  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase") {
    const { getServiceClient } = await import("@/lib/api/supabase/client");
    const db = getServiceClient();
    const [{ data: member }, { data: family }, { data: students }] = await Promise.all([
      // Any profile in the family may act (a parent may hold a staff role).
      db.from("profiles").select("id").eq("family_id", familyId).limit(1).maybeSingle(),
      db.from("families").select("name").eq("id", familyId).maybeSingle(),
      db.from("students").select("id, first_name, preferred_name").eq("family_id", familyId),
    ]);
    actorId = member ? String(member.id) : undefined;
    familyName = family ? String(family.name) : undefined;
    studentNamesById = Object.fromEntries(
      (students ?? []).map((s) => [String(s.id), String(s.preferred_name ?? s.first_name)])
    );
  } else {
    const { users, students, families } = await import("@/lib/api/mock/seed-data");
    const parent = users.find((u) => u.role === "parent" && u.familyId === familyId);
    const family = families.find((f) => f.id === familyId);
    actorId = parent?.id;
    familyName = family?.name;
    studentNamesById = Object.fromEntries(
      students
        .filter((s) => s.familyId === familyId)
        .map((s) => [s.id, s.preferredName ?? s.firstName])
    );
  }

  if (!actorId || !familyName) return new NextResponse("Not found", { status: 404 });

  const events = await provider.getFamilyCalendar(actorId, familyId);
  const ics = buildFamilyIcs(events, { familyName, studentNamesById });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="novapa-family.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
