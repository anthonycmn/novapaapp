import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Phone, ShieldAlert } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Family directory" };

/**
 * Family directory — staff and admin only (#3).
 *
 * This is the single densest concentration of personal data in the app:
 * every family, their children, contact details, and medical flags. It is
 * deliberately NOT reachable by families, and the data layer refuses the
 * call for anyone who isn't staff.
 */
export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { q } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();

  const directory = await getProvider().getFamiliesDirectory(user.id);

  const filtered = query
    ? directory.filter((entry) => {
        const haystack = [
          entry.family.name,
          ...entry.students.map((s) => `${s.firstName} ${s.lastName} ${s.preferredName ?? ""}`),
          ...entry.guardians.map((g) => `${g.fullName} ${g.email}`),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : directory;

  const totalStudents = directory.reduce((sum, entry) => sum + entry.students.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Family directory</h1>
        <p className="text-muted-foreground">
          {directory.length} families · {totalStudents} students
        </p>
      </div>

      <Card className="border-gold/50 bg-accent">
        <CardContent className="flex items-start gap-2 p-3 text-sm text-accent-foreground">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            Staff and administrators only. Contains contact details and medical
            flags for minors — don&apos;t export, screenshot, or share it.
          </p>
        </CardContent>
      </Card>

      <form className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search families, students, guardians…"
          aria-label="Search the directory"
          className="h-11 flex-1 rounded-lg border border-input bg-card px-3 text-base"
        />
        <button
          type="submit"
          className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Search
        </button>
      </form>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No families match &ldquo;{q}&rdquo;.
          </CardContent>
        </Card>
      ) : (
        filtered.map(({ family, students, guardians }) => (
          <Card key={family.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div>
                <h2 className="font-semibold">{family.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {family.city}, {family.state} · prefers{" "}
                  {family.preferredContactMethod.toUpperCase()}
                  {family.communicationLanguage !== "en" &&
                    ` · language: ${family.communicationLanguage}`}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                {students.map((student) => (
                  <Link
                    key={student.id}
                    href={`/family/students/${student.id}`}
                    className="flex items-center gap-3 rounded-lg p-1 hover:bg-accent"
                  >
                    <Avatar
                      name={`${student.firstName} ${student.lastName}`}
                      src={student.headshotUrl}
                      className="size-9 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {student.preferredName ?? student.firstName} {student.lastName}
                        {student.pronouns && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {student.pronouns}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        Grade {student.grade}
                        {student.school ? ` · ${student.school}` : ""}
                      </p>
                    </div>
                    {(student.allergies || student.medicalFlags) && (
                      <Badge variant="destructive" className="shrink-0">
                        Medical
                      </Badge>
                    )}
                  </Link>
                ))}
              </div>

              <div className="flex flex-col gap-1 border-t pt-2">
                {guardians.map((guardian) => (
                  <div
                    key={guardian.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                  >
                    <span className="font-medium">
                      {guardian.fullName}
                      {guardian.isPrimary && (
                        <span className="ml-1 text-xs text-muted-foreground">primary</span>
                      )}
                    </span>
                    <a
                      href={`mailto:${guardian.email}`}
                      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                    >
                      <Mail aria-hidden className="size-3.5" />
                      {guardian.email}
                    </a>
                    {guardian.phone && (
                      <a
                        href={`tel:${guardian.phone}`}
                        className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                      >
                        <Phone aria-hidden className="size-3.5" />
                        {guardian.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {family.staffNotes && (
                <p className="rounded-lg bg-muted p-2 text-sm">
                  <span className="font-medium">Staff note: </span>
                  {family.staffNotes}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
