import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { NewThreadForm } from "./new-thread-form";

export const metadata = { title: "New message" };

export default async function NewMessagePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/admin/messages");

  const students = await getProvider().getStudentsForFamily(user.id, user.familyId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New message</h1>
        <p className="text-muted-foreground">
          Goes to a role, not one person — so nothing waits on someone&apos;s day off.
        </p>
      </div>
      <Card>
        <CardContent className="p-5">
          <NewThreadForm students={students} />
        </CardContent>
      </Card>
    </div>
  );
}
