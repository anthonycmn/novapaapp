import { getProvider } from "@/lib/api";
import { reviewProfile } from "@/lib/profile-completeness";

/**
 * Everything a "is this profile complete?" surface needs, loaded once.
 *
 * The rules have lived in lib/profile-completeness since #9 — but the DATA
 * assembly (season, family, students, guardians, one health form per child)
 * was copied verbatim into /family, /family/edit and the dashboard's
 * needs-attention panel, which is exactly the three-copies-drift the family
 * page's own comment warns about (Sep 6 2026 review). One loader; the three
 * surfaces render what it returns.
 *
 * Season rides in the same Promise.all — it was awaited serially before the
 * other three on the portal's hottest page.
 */
export async function loadProfileReview(userId: string, familyId: string) {
  const provider = getProvider();
  const [season, family, students, guardians] = await Promise.all([
    provider.getCurrentSeason(),
    provider.getFamily(userId, familyId),
    provider.getStudentsForFamily(userId, familyId),
    provider.getGuardians(userId, familyId),
  ]);
  if (!family) return null;

  // One health form per student for this season. Per-student rather than the
  // staff-scoped status call, which is keyed by production and would answer
  // a different question.
  const healthForms = new Map(
    await Promise.all(
      students.map(
        async (student) =>
          [student.id, await provider.getHealthForm(userId, student.id, season.id)] as const
      )
    )
  );

  const review = reviewProfile({ family, guardians, students, healthForms });
  return { family, guardians, students, healthForms, review };
}
