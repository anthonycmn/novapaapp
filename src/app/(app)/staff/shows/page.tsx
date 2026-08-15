import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { getMyShows } from "@/lib/staff-shows";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "My shows" };

/**
 * "My Shows": each staff member's own productions (from the portal's
 * staffing plan, synced hourly). Admins and super admins see every show.
 * Click through to the show dashboard: casting, roster, curriculum.
 */
export default async function MyShowsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") redirect("/admin");

  const shows = await getMyShows(user);
  const isAdmin = hasRoleAtLeast(user, "admin");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">My shows</h1>
        <p className="text-muted-foreground">
          {isAdmin
            ? "Every production this season — your assigned shows first."
            : "The productions you're working this season."}
        </p>
      </div>

      {shows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No shows assigned yet — assignments come from the staffing plan
            and refresh every hour.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {shows.map(({ production, myRoles, enrolledCount }) => (
          <Link key={production.id} href={`/staff/shows/${production.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-2 p-4">
                <p className="font-medium leading-tight">{production.title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {myRoles.map((role) => (
                    <Badge key={role}>{role}</Badge>
                  ))}
                  <span className="text-sm text-muted-foreground">
                    {enrolledCount} enrolled
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
