import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Staff profile" };

export default async function StaffProfilePage({
  params,
}: {
  params: Promise<{ staffId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { staffId } = await params;

  const provider = getProvider();
  const member = await provider.getStaffProfile(staffId);
  if (!member || !member.isPublished) notFound();

  // Programs this staff member currently teaches (classes) or directs.
  const [classes, productions] = await Promise.all([
    provider.getClasses(),
    provider.getProductions(),
  ]);
  const theirClasses = classes.filter((c) => c.staffIds.includes(staffId));
  const theirProductions = productions.filter((p) => p.directorStaffId === staffId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <Avatar name={member.fullName} src={member.photoUrl} className="size-16 text-lg" />
        <div>
          <h1 className="text-2xl font-semibold">{member.fullName}</h1>
          <p className="text-muted-foreground">{member.title}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {member.specialties.map((specialty) => (
          <Badge key={specialty} variant="secondary">
            {specialty}
          </Badge>
        ))}
      </div>

      <Card>
        <CardContent className="p-5 text-sm leading-relaxed">{member.bio}</CardContent>
      </Card>

      {member.credits && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Credits & training</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">{member.credits}</CardContent>
        </Card>
      )}

      {(theirClasses.length > 0 || theirProductions.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Currently working on</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 pt-0 text-sm">
            {theirProductions.map((production) => (
              <p key={production.id}>
                🎬 Directing <span className="font-medium">{production.title}</span>
              </p>
            ))}
            {theirClasses.map((classOffering) => (
              <p key={classOffering.id}>
                🎓 Teaching <span className="font-medium">{classOffering.name}</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
