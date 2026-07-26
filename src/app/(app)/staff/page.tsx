import Link from "next/link";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Staff" };

/** Staff showcase (#14): browsable directory of teaching artists. */
export default async function StaffDirectoryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const staff = await getProvider().getStaffProfiles();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Our staff</h1>
        <p className="text-muted-foreground">
          The teaching artists and production team behind every show.
        </p>
      </div>

      {staff.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Staff profiles are being polished backstage — check back soon.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {staff.map((member) => (
            <Link key={member.id} href={`/staff/${member.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar name={member.fullName} src={member.photoUrl} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{member.fullName}</p>
                    <p className="text-sm text-muted-foreground">{member.title}</p>
                  </div>
                  <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                    {member.specialties.slice(0, 2).map((specialty) => (
                      <Badge key={specialty} variant="secondary">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
