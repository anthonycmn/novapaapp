import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FamilyForm } from "./family-form";

export const metadata = { title: "Edit family" };

export default async function EditFamilyPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/family");

  const family = await getProvider().getFamily(user.id, user.familyId);
  if (!family) redirect("/family");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Edit household</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Address & contact</CardTitle>
          <CardDescription>
            Used for rosters, emergency contact, and mailings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FamilyForm family={family} />
        </CardContent>
      </Card>
    </div>
  );
}
