import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { getProvider } from "@/lib/api";
import type { StaffAssignment } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { StaffBioCard } from "@/components/staff/bio-card";

export const metadata = { title: "Our staff" };

/**
 * Our staff — the people in the room with your child, and nobody else.
 *
 * This used to be the company directory: fifteen colleagues, sorted by name,
 * most of whom a given family will never meet. Tony, 17 Aug 2026: "They don't
 * need to see the whole staff, but they need to see the staff that are
 * assigned to that class or that show."
 *
 * The subtraction is the feature. A parent looking somebody up has just been
 * handed a name at pickup, or is deciding whether to raise something with the
 * person who runs the room; either way the answer is four faces, not fifteen,
 * and each one carries the job they hold on THIS family's show or class rather
 * than a generic company title.
 */
export default async function StaffDirectoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const provider = getProvider();

  const assignments: StaffAssignment[] = user.familyId
    ? await provider.getStaffForFamily(user.id, user.familyId)
    : [];

  // Staff without a family of their own still get the company directory —
  // they are looking colleagues up, not their child's teachers.
  if (!user.familyId) {
    const everyone = await provider.getStaffProfiles();
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Our staff</h1>
          <p className="text-muted-foreground">Everyone with a published profile.</p>
        </div>
        <div className="flex flex-col gap-2">
          {everyone.map((member) => (
            <Link key={member.id} href={`/staff/${member.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar name={member.fullName} src={member.photoUrl} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground">{member.title}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Our staff</h1>
        <p className="text-muted-foreground">
          The people teaching and directing your children. Tap anyone to read
          their bio.
        </p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Users aria-hidden className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nobody assigned yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Once your child is enrolled in a show or a class, the people
              running it appear here with their bios. In the meantime the{" "}
              <Link href="/shows" className="text-primary underline-offset-4 hover:underline">
                shows
              </Link>{" "}
              and{" "}
              <Link href="/classes" className="text-primary underline-offset-4 hover:underline">
                classes
              </Link>{" "}
              pages list what is running.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {assignments.map((assignment) => (
            <StaffBioCard key={assignment.profile.id} assignment={assignment} />
          ))}
        </div>
      )}
    </div>
  );
}
