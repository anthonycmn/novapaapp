import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { groupTopics } from "@/lib/api/messages/topics";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { NewThreadForm } from "./new-thread-form";

export const metadata = { title: "New message" };

export default async function NewMessagePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/admin/messages");

  const provider = getProvider();
  const [students, topics] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    // Their own shows and classes as well as the org-wide themes: the question
    // a parent asks most is about the specific room their child is in.
    provider.listMessageTopicsForFamily(user.id, user.familyId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">New message</h1>
        <p className="text-muted-foreground">
          Tell us what it&apos;s about and we&apos;ll send it straight to the
          person who handles it.
        </p>
      </div>
      <Card>
        <CardContent className="p-5">
          <NewThreadForm students={students} groups={groupTopics(topics)} />
        </CardContent>
      </Card>
    </div>
  );
}
