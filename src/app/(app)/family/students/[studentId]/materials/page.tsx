import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";

/**
 * The materials page, which is no longer a page.
 *
 * Tony, 3 Sep 2026: "this should all be on the audition page — not a separate
 * page all together." The headshot, resume and recording now sit under the
 * audition form, so this route exists only to carry the people who have it
 * bookmarked, or who follow it from an email sent before the move.
 *
 * Where to send them is the whole question. If this child has exactly one show
 * they can audition for, that is unambiguously the page they wanted. Anything
 * else — several shows, or none — and only they can say which, so they land on
 * the auditions list rather than on a show somebody guessed.
 *
 * The access check still happens, the same way the audition page does it: the
 * student has to be in this family. A redirect that skipped it would turn a
 * retired page into a way of finding out whether a student id exists.
 */
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/auditions");
  const { studentId } = await params;

  const provider = getProvider();
  const students = await provider.getStudentsForFamily(user.id, user.familyId);
  const student = students.find((entry) => entry.id === studentId);
  if (!student) redirect("/auditions");

  const enrollments = await provider.getEnrollmentsForStudent(user.id, student.id);
  const productionIds = [
    ...new Set(
      enrollments
        .filter((enrollment) => enrollment.status === "enrolled" && enrollment.productionId)
        .map((enrollment) => enrollment.productionId as string)
    ),
  ];

  redirect(
    productionIds.length === 1
      ? `/auditions/${productionIds[0]}/${student.id}`
      : "/auditions"
  );
}
