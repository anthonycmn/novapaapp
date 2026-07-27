import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffEditForm } from "./edit-form";

export const metadata = { title: "Edit my profile" };

/** Staff self-edit (#14). Changes queue for admin approval before publishing. */
export default async function StaffEditPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
  if (!user.staffId) redirect("/admin");

  const profile = await getProvider().getStaffProfile(user.staffId);
  if (!profile) redirect("/admin");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Edit my profile</h1>
        <p className="text-muted-foreground">
          An administrator reviews changes before they go live.
        </p>
      </div>

      {profile.pendingChanges && (
        <Card className="border-gold/50 bg-accent">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-accent-foreground">
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              You have changes awaiting approval. Your current profile stays
              live until an administrator reviews them. Editing again replaces
              what&apos;s pending.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle as="h2" className="text-base">
            {profile.fullName}
          </CardTitle>
          <CardDescription>
            {profile.isPublished ? "Visible to families" : "Not published yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffEditForm profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
